import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { Contribution } from '@shipreward/shared';
import { AuditService } from '../services/audit.service';
import { BudgetService } from '../services/budget.service';
import { BitrefillService } from '../services/bitrefill.service';

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
    rewardTier: r.reward_tier || 'GOOD',
    suggestedRewardUsd: r.suggested_reward_usd ?? 0.55,
    suggestedProductId: r.suggested_product_id || 'swiggy-money-india',
    suggestedPackageValue: r.suggested_package_value || '50',
    approvalStatus: r.approval_status || 'NOT_REQUIRED',
    approvedBy: r.approved_by || null,
    approvalReason: r.approval_reason || null,
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

contributionRouter.get('/contributions', (req: Request, res: Response) => {
  const { programId, status, approvalStatus, isDemo } = req.query;
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
  if (approvalStatus) {
    query += ' AND approval_status = ?';
    params.push(approvalStatus);
  }
  if (isDemo !== undefined) {
    query += ' AND is_demo = ?';
    params.push(isDemo === 'true' ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(query).all(...params) as any[];
  res.json(rows.map(mapRowToContribution));
});

contributionRouter.get('/contributions/pending-approval', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM contributions 
    WHERE approval_status = 'PENDING_APPROVAL' OR verification_status = 'NEEDS_REVIEW'
    ORDER BY created_at DESC LIMIT 100
  `).all() as any[];
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
 * POST /api/contributions/:id/approve
 * Authenticated human approval override for borderline, high-tier or academic milestone submissions.
 */
contributionRouter.post('/contributions/:id/approve', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reviewer, reason, fulfillReward } = req.body;
  const reviewerName = reviewer || 'Programme Coordinator';
  const approvalReason = reason || 'Manual review sign-off based on contribution quality';

  const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
  if (!contrib) {
    res.status(404).json({ error: 'Contribution not found' });
    return;
  }

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(contrib.program_id) as any;
  const rewardAmount = contrib.suggested_reward_usd || (program ? program.per_contribution_reward_usd : 0.55);

  // Validate spend authorization against programme budget
  const authCheck = BudgetService.authorizeSpend(contrib.program_id, rewardAmount, Boolean(contrib.is_demo));
  if (!authCheck.authorized) {
    res.status(400).json({ error: `Cannot approve: ${authCheck.reason}` });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE contributions
    SET verification_status = 'VERIFIED',
        approval_status = 'APPROVED',
        approved_by = ?,
        approval_reason = ?,
        updated_at = ?
    WHERE id = ?
  `).run(reviewerName, approvalReason, now, contrib.id);

  AuditService.log({
    eventType: 'POLICY_AUTHORIZED',
    actor: reviewerName,
    decision: 'AUTHORIZED',
    programId: contrib.program_id,
    contributionId: contrib.id,
    costUsd: rewardAmount,
    details: `Manual approval granted for PR #${contrib.pr_number} by ${reviewerName}: ${approvalReason}`
  });

  // If demo contribution and fulfillment requested, fulfill simulated reward
  let purchaseResult = null;
  if (fulfillReward && contrib.is_demo) {
    try {
      purchaseResult = await BitrefillService.executePurchase({
        contributionId: contrib.id,
        productId: contrib.suggested_product_id || 'swiggy-money-india',
        packageValue: contrib.suggested_package_value || '50',
        intentPurpose: `Approved reward for PR #${contrib.pr_number}`,
        manualApproval: true,
        confirmedByAdmin: true,
        approvedBy: reviewerName,
        isDemo: true
      });
    } catch (err: any) {
      // Fulfillment failure in demo is non-fatal to the approval
    }
  }

  res.json({
    success: true,
    message: `Contribution PR #${contrib.pr_number} successfully verified and approved.`,
    approvalStatus: 'APPROVED',
    contribution: mapRowToContribution(db.prepare('SELECT * FROM contributions WHERE id = ?').get(contrib.id)),
    purchase: purchaseResult
  });
});

/**
 * POST /api/contributions/:id/reject
 * Reject a contribution during manual review.
 */
contributionRouter.post('/contributions/:id/reject', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reviewer, reason } = req.body;
  const reviewerName = reviewer || 'Programme Coordinator';
  const rejectionReason = reason || 'Contribution did not meet rubric standards during review.';

  const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
  if (!contrib) {
    res.status(404).json({ error: 'Contribution not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE contributions
    SET verification_status = 'REJECTED',
        approval_status = 'REJECTED',
        approved_by = ?,
        approval_reason = ?,
        updated_at = ?
    WHERE id = ?
  `).run(reviewerName, rejectionReason, now, contrib.id);

  AuditService.log({
    eventType: 'POLICY_AUTHORIZED',
    actor: reviewerName,
    decision: 'REJECTED',
    programId: contrib.program_id,
    contributionId: contrib.id,
    details: `Contribution PR #${contrib.pr_number} rejected by ${reviewerName}: ${rejectionReason}`
  });

  res.json({
    success: true,
    message: `Contribution PR #${contrib.pr_number} rejected.`,
    approvalStatus: 'REJECTED',
    contribution: mapRowToContribution(db.prepare('SELECT * FROM contributions WHERE id = ?').get(contrib.id))
  });
});
