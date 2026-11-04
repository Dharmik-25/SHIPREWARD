import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { RewardRecord } from '@shipreward/shared';

export const rewardRouter = Router();

function mapRowToReward(r: any): RewardRecord {
  return {
    id: r.id,
    contributionId: r.contribution_id,
    programId: r.program_id,
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
    createdAt: r.created_at,
    deliveredAt: r.delivered_at
  };
}

rewardRouter.get('/rewards', (req: Request, res: Response) => {
  const { programId, isDemo } = req.query;
  let query = 'SELECT * FROM rewards WHERE 1=1';
  const params: any[] = [];

  if (programId) {
    query += ' AND program_id = ?';
    params.push(programId);
  }
  if (isDemo !== undefined) {
    query += ' AND is_demo = ?';
    params.push(isDemo === 'true' ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(query).all(...params) as any[];
  res.json(rows.map(mapRowToReward));
});

rewardRouter.get('/rewards/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const row = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Reward not found' });
    return;
  }
  res.json(mapRowToReward(row));
});
