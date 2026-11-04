import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { Contribution } from '@shipreward/shared';
import { AuditService } from '../services/audit.service';
import { BudgetService } from '../services/budget.service';
import { BitrefillService } from '../services/bitrefill.service';
import crypto from 'node:crypto';

export const contributionRouter = Router();

function mapRowToContribution(r: any): Contribution {
  return {
    id: r.id,
    programId: r.program_id,
    githubDeliveryId: r.github_delivery_id,
    prNumber: r.pr_number,
    prTitle: r.pr_title,
    prUrl: r.pr_url,
    contributor: r.contributor,
    contributorAvatar: r.contributor_avatar,
    baseBranch: r.base_branch,
    headBranch: r.head_branch,
    changedFilesCount: r.changed_files_count,
    additions: r.additions,
    deletions: r.deletions,
    mergedAt: r.merged_at,
    ciStatus: r.ci_status,
    maintainerApproved: Boolean(r.maintainer_approved),
    selfApproved: Boolean(r.self_approved),
    evaluationScore: r.evaluation_score,
    verificationStatus: r.verification_status,
    fraudFlags: JSON.parse(r.fraud_flags || '[]'),
    evidenceDetails: JSON.parse(r.evidence_details || '{}'),
    aiExplanation: r.ai_explanation,
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

contributionRouter.get('/contributions', (req: Request, res: Response) => {
  const { programId, status, isDemo } = req.query;
  let query = 'SELECT * FROM contributions WHERE 1=1';
  const params: any[] = [];

  if (programId) {
    query += ' AND program_id = ?';
    params.push(programId);
  }
  if (status) {
    query += ' AND verification_status = ?';
    params.push(status);
  }
  if (isDemo !== undefined) {
    query += ' AND is_demo = ?';
    params.push(isDemo === 'true' ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(query).all(...params) as any[];
  res.json(rows.map(mapRowToContribution));
});

contributionRouter.get('/contributions/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const row = db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Contribution not found' });
    return;
  }
  res.json(mapRowToContribution(row));
});

/**
 * Manual override approval by Professor / Maintainer.
 */
contributionRouter.post('/contributions/:id/approve', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
  if (!contrib) {
    res.status(404).json({ error: 'Contribution not found' });
    return;
  }

  if (contrib.verification_status === 'VERIFIED') {
    res.status(400).json({ error: 'Contribution is already verified and rewarded.' });
    return;
  }

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(contrib.program_id) as any;
  const rewardAmount = program ? program.per_contribution_reward_usd : 5.0;

  // Check budget authorization
  const authCheck = BudgetService.authorizeSpend(contrib.program_id, rewardAmount);
  if (!authCheck.authorized) {
    res.status(400).json({ error: `Cannot approve: ${authCheck.reason}` });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE contributions
    SET verification_status = 'VERIFIED',
        updated_at = ?
    WHERE id = ?
  `).run(now, contrib.id);

  AuditService.log({
    eventType: 'POLICY_AUTHORIZED',
    actor: req.body.reviewer || 'maintainer_manual_override',
    decision: 'AUTHORIZED',
    programId: contrib.program_id,
    contributionId: contrib.id,
    costUsd: rewardAmount,
    details: `Manual approval granted for PR #${contrib.pr_number} by maintainer/professor.`
  });

  // Fulfill reward
  try {
    const defaultProduct = 'swiggy-india';
    const purchaseResult = await BitrefillService.executePurchase({
      productId: defaultProduct,
      packageValue: '500',
      intentPurpose: `Manual reward payout for PR #${contrib.pr_number}`,
      isDemo: Boolean(contrib.is_demo)
    });

    const rewardId = 'rew_' + crypto.randomBytes(6).toString('hex');
    db.prepare(`
      INSERT INTO rewards (
        id, contribution_id, program_id, contributor, recipient_email,
        product_id, product_name, package_value, package_currency, price_usd,
        invoice_id, invoice_status, order_id, order_status, masked_voucher_code,
        redemption_instructions, is_demo, created_at, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rewardId,
      contrib.id,
      contrib.program_id,
      contrib.contributor,
      null,
      defaultProduct,
      purchaseResult.productName,
      purchaseResult.packageValue,
      purchaseResult.packageCurrency,
      purchaseResult.priceUsd,
      purchaseResult.invoiceId,
      purchaseResult.invoiceStatus,
      purchaseResult.orderId,
      purchaseResult.orderStatus,
      purchaseResult.maskedVoucherCode,
      purchaseResult.redemptionInstructions,
      contrib.is_demo,
      now,
      purchaseResult.deliveredAt
    );

    BudgetService.recordSpend(contrib.program_id, purchaseResult.priceUsd, Boolean(contrib.is_demo));

    AuditService.log({
      eventType: 'BITREFILL_ORDER_DELIVERED',
      actor: 'bitrefill_fulfillment',
      decision: 'PROCESSED',
      programId: contrib.program_id,
      contributionId: contrib.id,
      rewardId,
      costUsd: purchaseResult.priceUsd,
      details: `Fulfilled manual reward for PR #${contrib.pr_number} via Bitrefill invoice ${purchaseResult.invoiceId}. Delivered state reached.`
    });

    res.json({ message: 'Contribution approved and reward fulfilled', rewardId });
  } catch (err: any) {
    res.status(500).json({ error: `Reward fulfillment error: ${err.message}` });
  }
});
