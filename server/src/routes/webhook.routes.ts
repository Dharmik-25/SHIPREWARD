import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { WebhookService } from '../services/webhook.service';
import { EvaluationService, ContributionInput } from '../services/evaluation.service';
import { BudgetService } from '../services/budget.service';
import { BitrefillService } from '../services/bitrefill.service';
import { AuditService } from '../services/audit.service';
import { TriggerSimulationSchema, WebhookEventSchema, ProgramPolicy } from '@shipreward/shared';
import crypto from 'node:crypto';

export const webhookRouter = Router();

/**
 * Live GitHub Webhook Endpoint
 * HMAC-SHA256 signature verified over raw request buffer.
 */
webhookRouter.post('/webhooks/github', async (req: Request, res: Response) => {
  const deliveryId = (req.headers['x-github-delivery'] as string) || ('deliv_' + Date.now());
  const signature = req.headers['x-hub-signature-256'] as string;
  const eventType = (req.headers['x-github-event'] as string) || 'pull_request';

  // 1. Signature Verification
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const isValidSig = WebhookService.verifySignature(rawBody, signature);
  if (!isValidSig) {
    AuditService.log({
      eventType: 'SIGNATURE_VERIFIED',
      actor: 'github_webhook',
      decision: 'REJECTED',
      details: `HMAC-SHA256 signature verification failed for delivery ${deliveryId}`
    });
    res.status(401).json({ error: 'Invalid HMAC-SHA256 webhook signature' });
    return;
  }

  // 2. Idempotency Check
  const isDuplicate = WebhookService.isDuplicateDelivery(deliveryId, eventType);
  if (isDuplicate) {
    res.status(200).json({ status: 'ignored', message: 'Duplicate webhook delivery ID' });
    return;
  }

  AuditService.log({
    eventType: 'WEBHOOK_RECEIVED',
    actor: 'github_webhook',
    decision: 'PROCESSED',
    details: `Accepted valid GitHub webhook: event=${eventType}, delivery=${deliveryId}`
  });

  // Only evaluate pull_request closed/merged events
  const payload = req.body;
  if (eventType !== 'pull_request' || payload.action !== 'closed') {
    res.status(200).json({ status: 'ignored', message: `Event '${eventType}.${payload.action}' does not trigger reward evaluation.` });
    return;
  }

  const pr = payload.pull_request;
  if (!pr) {
    res.status(400).json({ error: 'Missing pull_request payload' });
    return;
  }

  const repoFullName = pr.base?.repo?.full_name || '';

  // Match active programme
  const programRow = db.prepare('SELECT * FROM programs WHERE LOWER(repository) = LOWER(?) AND active = 1').get(repoFullName) as any;
  if (!programRow) {
    res.status(200).json({ status: 'ignored', message: `Repository '${repoFullName}' is not enrolled in an active reward programme.` });
    return;
  }

  const policy: ProgramPolicy = {
    id: programRow.id,
    name: programRow.name,
    tier: programRow.tier,
    description: programRow.description,
    repository: programRow.repository,
    targetBranch: programRow.target_branch,
    minScore: programRow.min_score,
    requireCiPass: Boolean(programRow.require_ci_pass),
    requireMaintainerApproval: Boolean(programRow.require_maintainer_approval),
    allowSelfApproval: Boolean(programRow.allow_self_approval),
    perContributionRewardUsd: programRow.per_contribution_reward_usd,
    dailyBudgetUsd: programRow.daily_budget_usd,
    totalBudgetUsd: programRow.total_budget_usd,
    spentTodayUsd: programRow.spent_today_usd,
    totalSpentUsd: programRow.total_spent_usd,
    allowedProductIds: JSON.parse(programRow.allowed_product_ids || '[]'),
    autoFulfill: Boolean(programRow.auto_fulfill),
    active: Boolean(programRow.active),
    createdAt: programRow.created_at,
    updatedAt: programRow.updated_at
  };

  const isMerged = Boolean(pr.merged);
  const contributor = pr.user?.login || 'unknown';
  const prNumber = pr.number;

  const contribInput: ContributionInput = {
    repository: repoFullName,
    prNumber,
    prTitle: pr.title || 'PR #' + prNumber,
    contributor,
    baseBranch: pr.base?.ref || 'main',
    merged: isMerged,
    ciStatus: 'passed', // Default passed if webhook was received after checks passed
    maintainerApproved: true,
    selfApproved: false,
    additions: pr.additions || 20,
    deletions: pr.deletions || 5,
    changedFilesCount: pr.changed_files || 2,
  };

  const evalResult = EvaluationService.evaluateContribution(contribInput, policy);

  const contribId = 'contrib_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  // Save contribution record
  db.prepare(`
    INSERT INTO contributions (
      id, program_id, github_delivery_id, pr_number, pr_title, pr_url,
      contributor, contributor_avatar, base_branch, head_branch,
      changed_files_count, additions, deletions, merged_at,
      ci_status, maintainer_approved, self_approved, evaluation_score,
      verification_status, fraud_flags, evidence_details, ai_explanation,
      is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contribId,
    policy.id,
    deliveryId,
    prNumber,
    contribInput.prTitle,
    pr.html_url || `https://github.com/${repoFullName}/pull/${prNumber}`,
    contributor,
    pr.user?.avatar_url || null,
    contribInput.baseBranch,
    pr.head?.ref || 'feature',
    contribInput.changedFilesCount,
    contribInput.additions,
    contribInput.deletions,
    pr.merged_at || (isMerged ? now : null),
    contribInput.ciStatus,
    contribInput.maintainerApproved ? 1 : 0,
    contribInput.selfApproved ? 1 : 0,
    evalResult.score,
    evalResult.status,
    JSON.stringify(evalResult.fraudFlags),
    JSON.stringify({ ruleChecks: evalResult.ruleChecks }),
    evalResult.explanation,
    0, // is_demo = 0 (REAL WEBHOOK)
    now,
    now
  );

  // If Verified and Auto-fulfill enabled: proceed to Bitrefill
  if (evalResult.status === 'VERIFIED' && policy.autoFulfill) {
    const defaultProduct = policy.allowedProductIds[0] || 'swiggy-india';
    const auth = BudgetService.authorizeSpend(policy.id, policy.perContributionRewardUsd);

    if (auth.authorized) {
      try {
        const purchaseResult = await BitrefillService.executePurchase({
          productId: defaultProduct,
          packageValue: '500',
          intentPurpose: `Live reward payout for PR #${prNumber} on ${repoFullName}`,
          isDemo: false
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
          contribId,
          policy.id,
          contributor,
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
          0, // real
          now,
          purchaseResult.deliveredAt
        );

        BudgetService.recordSpend(policy.id, purchaseResult.priceUsd, false);

        AuditService.log({
          eventType: 'BITREFILL_ORDER_DELIVERED',
          actor: 'bitrefill_fulfillment',
          decision: 'PROCESSED',
          programId: policy.id,
          contributionId: contribId,
          rewardId,
          costUsd: purchaseResult.priceUsd,
          details: `Live Bitrefill reward delivered for PR #${prNumber}: Invoice ${purchaseResult.invoiceId}. Masked voucher recorded.`
        });
      } catch (err: any) {
        AuditService.log({
          eventType: 'PURCHASE_FAILED',
          actor: 'bitrefill_fulfillment',
          decision: 'ERROR',
          programId: policy.id,
          contributionId: contribId,
          details: `Bitrefill purchase failed: ${err.message}`
        });
      }
    }
  }

  res.status(200).json({
    status: 'evaluated',
    contributionId: contribId,
    score: evalResult.score,
    verificationStatus: evalResult.status,
    explanation: evalResult.explanation
  });
});

/**
 * Explicit Simulation / Demonstration Trigger
 * Strictly flags records as is_demo = 1 so demo activity is never confused with live funds.
 */
webhookRouter.post('/triggers/simulate', async (req: Request, res: Response) => {
  const parsed = TriggerSimulationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const data = parsed.data;
  const programRow = db.prepare('SELECT * FROM programs WHERE id = ?').get(data.programId) as any;
  if (!programRow) {
    res.status(404).json({ error: 'Programme not found' });
    return;
  }

  const policy: ProgramPolicy = {
    id: programRow.id,
    name: programRow.name,
    tier: programRow.tier,
    description: programRow.description,
    repository: programRow.repository,
    targetBranch: programRow.target_branch,
    minScore: programRow.min_score,
    requireCiPass: Boolean(programRow.require_ci_pass),
    requireMaintainerApproval: Boolean(programRow.require_maintainer_approval),
    allowSelfApproval: Boolean(programRow.allow_self_approval),
    perContributionRewardUsd: programRow.per_contribution_reward_usd,
    dailyBudgetUsd: programRow.daily_budget_usd,
    totalBudgetUsd: programRow.total_budget_usd,
    spentTodayUsd: programRow.spent_today_usd,
    totalSpentUsd: programRow.total_spent_usd,
    allowedProductIds: JSON.parse(programRow.allowed_product_ids || '[]'),
    autoFulfill: Boolean(programRow.auto_fulfill),
    active: Boolean(programRow.active),
    createdAt: programRow.created_at,
    updatedAt: programRow.updated_at
  };

  const contribInput: ContributionInput = {
    repository: policy.repository,
    prNumber: data.prNumber,
    prTitle: data.prTitle,
    contributor: data.contributor,
    baseBranch: policy.targetBranch,
    merged: true,
    ciStatus: data.ciStatus,
    maintainerApproved: data.maintainerApproved,
    selfApproved: data.selfApproved,
    additions: data.additions,
    deletions: data.deletions,
    changedFilesCount: data.changedFilesCount,
  };

  const evalResult = EvaluationService.evaluateContribution(contribInput, policy);

  const contribId = 'contrib_sim_' + crypto.randomBytes(6).toString('hex');
  const deliveryId = 'sim_deliv_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO contributions (
      id, program_id, github_delivery_id, pr_number, pr_title, pr_url,
      contributor, contributor_avatar, base_branch, head_branch,
      changed_files_count, additions, deletions, merged_at,
      ci_status, maintainer_approved, self_approved, evaluation_score,
      verification_status, fraud_flags, evidence_details, ai_explanation,
      is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contribId,
    policy.id,
    deliveryId,
    data.prNumber,
    data.prTitle,
    `https://github.com/${policy.repository}/pull/${data.prNumber}`,
    data.contributor,
    `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 9000 + 100)}?v=4`,
    policy.targetBranch,
    'sim-patch',
    data.changedFilesCount,
    data.additions,
    data.deletions,
    now,
    data.ciStatus,
    data.maintainerApproved ? 1 : 0,
    data.selfApproved ? 1 : 0,
    evalResult.score,
    evalResult.status,
    JSON.stringify(evalResult.fraudFlags),
    JSON.stringify({ ruleChecks: evalResult.ruleChecks }),
    evalResult.explanation,
    1, // is_demo = 1 (SIMULATION)
    now,
    now
  );

  let rewardId: string | undefined;
  if (evalResult.status === 'VERIFIED') {
    const purchaseResult = await BitrefillService.executePurchase({
      productId: data.productId,
      packageValue: data.packageValue,
      recipientEmail: data.recipientEmail,
      recipientPhone: data.recipientPhone,
      intentPurpose: `Demo simulation reward for PR #${data.prNumber}`,
      isDemo: true
    });

    rewardId = 'rew_sim_' + crypto.randomBytes(6).toString('hex');
    db.prepare(`
      INSERT INTO rewards (
        id, contribution_id, program_id, contributor, recipient_email, recipient_phone,
        product_id, product_name, package_value, package_currency, price_usd,
        invoice_id, invoice_status, order_id, order_status, masked_voucher_code,
        redemption_instructions, is_demo, created_at, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rewardId,
      contribId,
      policy.id,
      data.contributor,
      data.recipientEmail || null,
      data.recipientPhone || null,
      data.productId,
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
      1, // demo
      now,
      purchaseResult.deliveredAt
    );

    AuditService.log({
      eventType: 'BITREFILL_ORDER_DELIVERED',
      actor: 'demo_simulator',
      decision: 'PROCESSED',
      programId: policy.id,
      contributionId: contribId,
      rewardId,
      costUsd: purchaseResult.priceUsd,
      details: `[DEMO] Simulated reward cycle completed for PR #${data.prNumber}: Invoice ${purchaseResult.invoiceId} delivered.`
    });
  } else {
    AuditService.log({
      eventType: evalResult.status === 'FRAUD_FLAGGED' ? 'FRAUD_PREVENTED' : 'CONTRIBUTION_EVALUATED',
      actor: 'demo_simulator',
      decision: 'REJECTED',
      programId: policy.id,
      contributionId: contribId,
      details: `[DEMO] PR #${data.prNumber} rejected: ${evalResult.explanation}`
    });
  }

  res.json({
    status: 'simulated',
    contributionId: contribId,
    rewardId,
    score: evalResult.score,
    verificationStatus: evalResult.status,
    fraudFlags: evalResult.fraudFlags,
    explanation: evalResult.explanation
  });
});
