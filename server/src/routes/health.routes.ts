import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { BitrefillService } from '../services/bitrefill.service';
import { SystemHealth } from '@shipreward/shared';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/health', async (req: Request, res: Response) => {
  try {
    // Check Database
    const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };
    const databaseStatus = dbCheck?.ok === 1 ? 'connected' : 'disconnected';

    // Check Bitrefill
    const bitrefillHealth = await BitrefillService.checkConnectionHealth();

    // Query Metrics (strictly distinguishing demo vs live)
    const progCount = (db.prepare('SELECT COUNT(*) as c FROM programs WHERE active = 1').get() as any).c;
    
    const liveContribs = (db.prepare('SELECT COUNT(*) as c FROM contributions WHERE is_demo = 0').get() as any).c;
    const demoContribs = (db.prepare('SELECT COUNT(*) as c FROM contributions WHERE is_demo = 1').get() as any).c;
    
    const liveRewards = (db.prepare("SELECT COUNT(*) as c FROM rewards WHERE is_demo = 0 AND order_status = 'delivered'").get() as any).c;
    const demoRewards = (db.prepare("SELECT COUNT(*) as c FROM rewards WHERE is_demo = 1 AND order_status = 'delivered'").get() as any).c;

    const fraudCount = (db.prepare("SELECT COUNT(*) as c FROM contributions WHERE verification_status = 'FRAUD_FLAGGED'").get() as any).c;

    // Daily Spend
    const dailyCap = parseFloat(process.env.SPEND_CAP_DAILY_USD || '1.00');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const spentTodayRow = db.prepare(`
      SELECT COALESCE(SUM(price_usd), 0) as s
      FROM rewards
      WHERE created_at >= ? AND is_demo = 0 AND order_status != 'failed'
    `).get(startOfToday.toISOString()) as any;
    const spentToday = spentTodayRow.s;

    const payload: SystemHealth = {
      status: databaseStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: process.env.NODE_ENV || 'development',
      database: databaseStatus,
      bitrefill: {
        status: bitrefillHealth.status,
        endpoint: bitrefillHealth.endpoint,
        dailySpendCapUsd: dailyCap,
        spentTodayUsd: spentToday,
        remainingTodayUsd: Math.max(0, dailyCap - spentToday),
        emergencyFreeze: process.env.EMERGENCY_PURCHASE_FREEZE === 'true',
        error: bitrefillHealth.error || null
      },
      metrics: {
        totalPrograms: progCount,
        liveContributions: liveContribs,
        demoContributions: demoContribs,
        liveRewardsDelivered: liveRewards,
        demoRewardsDelivered: demoRewards,
        fraudPreventedCount: fraudCount
      }
    };

    res.json(payload);
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /api/health/ready
 * Comprehensive production readiness probe verifying all critical subsystems:
 * 1. Database connectivity
 * 2. Cryptographic key availability (VOUCHER_ENCRYPTION_KEY)
 * 3. Bitrefill MCP gateway reachability
 * 4. Active reward programme availability
 */
healthRouter.get('/health/ready', async (req: Request, res: Response) => {
  const checks: Record<string, { ready: boolean; message: string }> = {};

  // 1. Database Check
  try {
    const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };
    checks.database = {
      ready: dbCheck?.ok === 1,
      message: dbCheck?.ok === 1 ? 'SQLite database operational' : 'Database query returned unexpected result'
    };
  } catch (err: any) {
    checks.database = { ready: false, message: `Database error: ${err.message}` };
  }

  // 2. Encryption Key Check
  const key = process.env.VOUCHER_ENCRYPTION_KEY;
  const isKeyValid = Boolean(key && key.length === 64 && /^[0-9a-fA-F]{64}$/.test(key));
  checks.encryption = {
    ready: isKeyValid,
    message: isKeyValid ? 'VOUCHER_ENCRYPTION_KEY valid (AES-256-GCM 32-byte)' : 'VOUCHER_ENCRYPTION_KEY missing or invalid format'
  };

  // 3. Bitrefill MCP Check
  try {
    const bfHealth = await BitrefillService.checkConnectionHealth();
    checks.bitrefill = {
      ready: bfHealth.status === 'connected',
      message: `Bitrefill status: ${bfHealth.status}`
    };
  } catch (err: any) {
    checks.bitrefill = { ready: false, message: `Bitrefill error: ${err.message}` };
  }

  // 4. Programme Configuration Check
  try {
    const progCount = (db.prepare('SELECT COUNT(*) as c FROM programs WHERE active = 1').get() as any).c;
    checks.programmes = {
      ready: progCount > 0,
      message: `${progCount} active reward programme(s) configured`
    };
  } catch (err: any) {
    checks.programmes = { ready: false, message: `Programmes error: ${err.message}` };
  }

  const allReady = Object.values(checks).every(c => c.ready);
  const statusCode = allReady ? 200 : 503;

  res.status(statusCode).json({
    ready: allReady,
    timestamp: new Date().toISOString(),
    checks
  });
});


