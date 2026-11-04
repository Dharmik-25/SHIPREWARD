import { db } from '../db/database';
import { AuditService } from './audit.service';

export class BudgetService {
  /**
   * Evaluates whether an intended purchase is authorized under spend caps and active balances.
   */
  static authorizeSpend(programId: string, amountUsd: number, isDemo = false): {
    authorized: boolean;
    reason?: string;
  } {
    if (isDemo) return { authorized: true };

    // 1. Check Global Emergency Kill Switch
    const emergencyFreeze = process.env.EMERGENCY_PURCHASE_FREEZE === 'true';
    if (emergencyFreeze) {
      AuditService.log({
        eventType: 'EMERGENCY_STOP_ACTIVATED',
        actor: 'budget_guardrail',
        decision: 'REJECTED',
        programId,
        costUsd: amountUsd,
        details: 'Purchase blocked: Emergency purchase freeze is active across all programmes.'
      });
      return { authorized: false, reason: 'EMERGENCY_FREEZE_ACTIVE' };
    }

    // 2. Check Single Reward Cap
    const singleCap = parseFloat(process.env.SPEND_CAP_SINGLE_REWARD_USD || '0.60');
    if (amountUsd > singleCap) {
      AuditService.log({
        eventType: 'POLICY_AUTHORIZED',
        actor: 'budget_guardrail',
        decision: 'REVIEW_REQUIRED',
        programId,
        costUsd: amountUsd,
        details: `Purchase blocked: Amount ($${amountUsd.toFixed(2)}) exceeds single reward cap ($${singleCap.toFixed(2)}).`
      });
      return { authorized: false, reason: `EXCEEDS_SINGLE_REWARD_CAP ($${singleCap.toFixed(2)})` };
    }

    // 3. Check Account-wide Daily Cap
    const dailyCap = parseFloat(process.env.SPEND_CAP_DAILY_USD || '1.00');
    
    // Sum real spend today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    const spendRow = db.prepare(`
      SELECT COALESCE(SUM(price_usd), 0) as spent
      FROM rewards
      WHERE created_at >= ? AND is_demo = 0 AND order_status != 'failed'
    `).get(todayIso) as { spent: number };

    const totalSpentToday = spendRow.spent;
    if (totalSpentToday + amountUsd > dailyCap) {
      AuditService.log({
        eventType: 'POLICY_AUTHORIZED',
        actor: 'budget_guardrail',
        decision: 'REJECTED',
        programId,
        costUsd: amountUsd,
        details: `Purchase blocked: Daily spend ($${(totalSpentToday + amountUsd).toFixed(2)}) would exceed hard daily cap ($${dailyCap.toFixed(2)}).`
      });
      return { authorized: false, reason: `EXCEEDS_DAILY_SPEND_CAP ($${dailyCap.toFixed(2)})` };
    }

    // 4. Check Programme-Specific Budget
    const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId) as any;
    if (!program) {
      return { authorized: false, reason: 'PROGRAM_NOT_FOUND' };
    }

    if (program.spent_today_usd + amountUsd > program.daily_budget_usd) {
      return { authorized: false, reason: `EXCEEDS_PROGRAM_DAILY_BUDGET ($${program.daily_budget_usd})` };
    }

    if (program.total_spent_usd + amountUsd > program.total_budget_usd) {
      return { authorized: false, reason: `EXCEEDS_PROGRAM_TOTAL_BUDGET ($${program.total_budget_usd})` };
    }

    return { authorized: true };
  }

  /**
   * Atomically reserves budget for a programme to prevent race conditions during concurrent purchase calls.
   * Uses atomic conditional SQL update. Returns false if concurrent requests exceed budget.
   */
  static reserveBudget(programId: string, amountUsd: number, isDemo = false): boolean {
    if (isDemo) return true;

    const stmt = db.prepare(`
      UPDATE programs
      SET spent_today_usd = spent_today_usd + ?,
          total_spent_usd = total_spent_usd + ?,
          updated_at = ?
      WHERE id = ? 
        AND (spent_today_usd + ?) <= daily_budget_usd
        AND (total_spent_usd + ?) <= total_budget_usd
    `);

    const result = stmt.run(amountUsd, amountUsd, new Date().toISOString(), programId, amountUsd, amountUsd);
    return result.changes > 0;
  }

  /**
   * Releases an atomic budget reservation if purchase fails or is rejected downstream.
   */
  static releaseReservation(programId: string, amountUsd: number, isDemo = false): void {
    if (isDemo) return;

    db.prepare(`
      UPDATE programs
      SET spent_today_usd = MAX(0, spent_today_usd - ?),
          total_spent_usd = MAX(0, total_spent_usd - ?),
          updated_at = ?
      WHERE id = ?
    `).run(amountUsd, amountUsd, new Date().toISOString(), programId);
  }

  /**
   * Records completed spend for a programme.
   */
  static recordSpend(programId: string, amountUsd: number, isDemo = false): void {
    if (isDemo) return;

    db.prepare(`
      UPDATE programs
      SET spent_today_usd = spent_today_usd + ?,
          total_spent_usd = total_spent_usd + ?,
          updated_at = ?
      WHERE id = ?
    `).run(amountUsd, amountUsd, new Date().toISOString(), programId);
  }
}
