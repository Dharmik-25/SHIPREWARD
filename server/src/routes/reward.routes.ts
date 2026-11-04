import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { RewardRecord } from '@shipreward/shared';
import { VoucherSecurityService } from '../services/voucher-security.service';
import { AuditService } from '../services/audit.service';

export const rewardRouter = Router();

function mapRowToReward(r: any): RewardRecord & { isClaimed?: boolean; claimedAt?: string | null } {
  return {
    id: r.id,
    contributionId: r.contribution_id,
    programId: r.program_id,
    prNumber: r.pr_number || undefined,
    contributor: r.contributor,
    recipientEmail: r.recipient_email,
    recipientPhone: r.recipient_phone,
    productId: r.product_id,
    productName: r.product_name,
    packageValue: r.package_value,
    packageCurrency: r.package_currency,
    priceUsd: r.price_usd,
    invoiceId: r.invoice_id,
    invoiceStatus: r.invoice_status,
    orderId: r.order_id,
    orderStatus: r.order_status,
    maskedVoucherCode: r.masked_voucher_code,
    redemptionInstructions: r.redemption_instructions,
    isDemo: Boolean(r.is_demo),
    isClaimed: Boolean(r.claimed_at),
    claimedAt: r.claimed_at || null,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at
  };
}

rewardRouter.get('/rewards', (req: Request, res: Response) => {
  const { programId, isDemo } = req.query;
  let query = 'SELECT r.*, c.pr_number FROM rewards r LEFT JOIN contributions c ON r.contribution_id = c.id WHERE 1=1';
  const params: any[] = [];

  if (programId) {
    query += ' AND r.program_id = ?';
    params.push(programId);
  }
  if (isDemo !== undefined) {
    query += ' AND r.is_demo = ?';
    params.push(isDemo === 'true' ? 1 : 0);
  }

  query += ' ORDER BY r.created_at DESC LIMIT 100';
  const rows = db.prepare(query).all(...params) as any[];
  res.json(rows.map(mapRowToReward));
});

rewardRouter.get('/rewards/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const row = db.prepare('SELECT r.*, c.pr_number FROM rewards r LEFT JOIN contributions c ON r.contribution_id = c.id WHERE r.id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Reward not found' });
    return;
  }
  res.json(mapRowToReward(row));
});

/**
 * POST /api/rewards/:id/claim
 * Secure claim & unmasking endpoint for the verified contributor.
 * Validates contributor identity or admin authorization before decrypting secrets.
 */
rewardRouter.post('/rewards/:id/claim', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { claimer } = req.body;

  if (!claimer || typeof claimer !== 'string') {
    res.status(400).json({ error: 'Missing required field: claimer (must match GitHub contributor username or maintainer)' });
    return;
  }

  const row = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: `Reward '${id}' not found.` });
    return;
  }

  // Authorization check: Must be the contributor or authorized admin
  const isAuthorized = claimer.toLowerCase() === row.contributor.toLowerCase() || claimer === 'admin';
  if (!isAuthorized) {
    AuditService.log({
      eventType: 'POLICY_AUTHORIZED',
      actor: claimer,
      decision: 'REJECTED',
      rewardId: row.id,
      details: `Unauthorized attempt to claim reward '${row.id}' designated for contributor '@${row.contributor}'.`
    });
    res.status(403).json({ error: `Unauthorized: Only @${row.contributor} or program maintainer can claim this voucher.` });
    return;
  }

  // Check if encrypted payload exists
  if (!row.encrypted_voucher_payload || !row.voucher_iv || !row.voucher_auth_tag) {
    res.json({
      success: true,
      rewardId: row.id,
      contributor: row.contributor,
      productName: row.product_name,
      maskedVoucherCode: row.masked_voucher_code,
      message: 'Voucher delivered via direct recharge or external link.',
      instructions: row.redemption_instructions
    });
    return;
  }

  try {
    const decrypted = VoucherSecurityService.decrypt({
      encryptedPayload: row.encrypted_voucher_payload,
      iv: row.voucher_iv,
      authTag: row.voucher_auth_tag
    });

    const now = new Date().toISOString();
    db.prepare('UPDATE rewards SET claimed_at = ?, claimed_by = ? WHERE id = ?').run(now, claimer, row.id);

    AuditService.log({
      eventType: 'BITREFILL_ORDER_DELIVERED',
      actor: claimer,
      decision: 'AUTHORIZED',
      rewardId: row.id,
      contributionId: row.contribution_id,
      programId: row.program_id,
      details: `Verified contributor @${claimer} successfully claimed reward voucher for ${row.product_name}.`
    });

    res.json({
      success: true,
      rewardId: row.id,
      contributor: row.contributor,
      productName: row.product_name,
      claimedAt: now,
      redemption: {
        code: decrypted.code,
        pin: decrypted.pin || null,
        link: decrypted.link || null,
        instructions: decrypted.instructions || row.redemption_instructions
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to decrypt secure voucher payload: ${err.message}` });
  }
});
