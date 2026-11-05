import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { WebhookService } from '../services/webhook.service';
import { EvaluationService, ContributionInput } from '../services/evaluation.service';
import { GitHubService } from '../services/github.service';
import { AuditService } from '../services/audit.service';
import { BitrefillService } from '../services/bitrefill.service';
import { TriggerSimulationSchema, ProgramPolicy } from '@shipreward/shared';
import crypto from 'node:crypto';

export const webhookRouter = Router();

/**
 * GET /api/github/repo-status
 * Verifies live connection to configured repository using GITHUB_TOKEN.
 */
webhookRouter.get('/github/repo-status', async (req: Request, res: Response) => {
  const repo = (req.query.repo as string) || 'shipreward/core-engine';
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    res.status(400).json({ error: 'Invalid repo format. Must be owner/repo' });
    return;
  }

  const access = await GitHubService.verifyRepoAccess(owner, repoName);
  res.json({
    repository: repo,
    ...access,
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim().length > 0),
    webhookSecretConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET && process.env.GITHUB_WEBHOOK_SECRET.trim().length > 0)
  });
});

/**
 * Contributor recipient mapping endpoints
 */
webhookRouter.get('/contributors/:username/recipient', (req: Request, res: Response) => {
  const username = req.params.username as string;
  const row = db.prepare('SELECT * FROM contributor_recipients WHERE LOWER(contributor_username) = LOWER(?)').get(username) as any;
  if (!row) {
    res.json({ contributor: username, recipientEmail: null, recipientPhone: null });
    return;
  }
  res.json({
    contributor: row.contributor_username,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    updatedAt: row.updated_at
  });
});

webhookRouter.post('/contributors/:username/recipient', (req: Request, res: Response) => {
  const username = req.params.username as string;
  const { recipientEmail, recipientPhone } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO contributor_recipients (contributor_username, recipient_email, recipient_phone, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(contributor_username) DO UPDATE SET
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      updated_at = excluded.updated_at
  `).run(username, recipientEmail || null, recipientPhone || null, now);

  res.json({ message: 'Recipient mapping updated', contributor: username, recipientEmail, recipientPhone });
});

/**
 * Live GitHub Webhook Endpoint
 * HMAC-SHA256 signature verified over raw request buffer.
 */
webhookRouter.post('/webhooks/github', async (req: Request, res: Response) => {
  const deliveryId = (req.headers['x-github-delivery'] as string) || ('deliv_' + Date.now());
  const signature = req.headers['x-hub-signature-256'] as string;
  const eventType = (req.headers['x-github-event'] as string) || 'pull_request';

  // 1. Signature Verification using Raw Body Buffer
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
    res.status(200).json({ status: 'ignored', message: 'Duplicate webhook delivery ID already processed' });
    return;
  }

  AuditService.log({
    eventType: 'WEBHOOK_RECEIVED',
    actor: 'github_webhook',
    decision: 'PROCESSED',
    details: `Accepted valid GitHub webhook: event=${eventType}, delivery=${deliveryId}`
  });

  const payload = req.body;

  // Handle pull_request events
  if (eventType === 'pull_request') {
    const action = payload.action;
    const pr = payload.pull_request;
    if (!pr) {
      res.status(400).json({ error: 'Missing pull_request object' });
      return;
    }

    const repoFullName = pr.base?.repo?.full_name || '';
    const [owner, repoName] = repoFullName.split('/');

    // Match enrolled active programme
    const programRow = db.prepare('SELECT * FROM programs WHERE LOWER(repository) = LOWER(?) AND active = 1').get(repoFullName) as any;
    if (!programRow) {
      res.status(200).json({ status: 'ignored', message: `Repository '${repoFullName}' is not enrolled in an active reward programme.` });
      return;
    }

    const policy: ProgramPolicy = {
      id: programRow.id,
      name: programRow.name,
      tier: programRow.tier,
      owner: programRow.owner || 'Community',
      fundingSource: programRow.funding_source || 'Treasury',
      description: programRow.description,
      repository: programRow.repository,
      targetBranch: programRow.target_branch,
      minScore: programRow.min_score,
      requireCiPass: Boolean(programRow.require_ci_pass),
      requireMaintainerApproval: Boolean(programRow.require_maintainer_approval),
      allowSelfApproval: Boolean(programRow.allow_self_approval),
      perContributionRewardUsd: programRow.per_contribution_reward_usd,
      approvalThresholdUsd: programRow.approval_threshold_usd ?? 1.00,
      dailyBudgetUsd: programRow.daily_budget_usd,
      totalBudgetUsd: programRow.total_budget_usd,
      spentTodayUsd: programRow.spent_today_usd,
      totalSpentUsd: programRow.total_spent_usd,
      allowedProductIds: JSON.parse(programRow.allowed_product_ids || '[]'),
      autoFulfill: Boolean(programRow.auto_fulfill),
      active: Boolean(programRow.active),
      rubricCriteria: programRow.rubric_criteria ? JSON.parse(programRow.rubric_criteria) : [],
      createdAt: programRow.created_at,
      updatedAt: programRow.updated_at
    };

    const contributor = pr.user?.login || 'unknown';
    const prNumber = pr.number;
    const prTitle = pr.title || `PR #${prNumber}`;
    const baseBranch = pr.base?.ref || 'main';
    const headBranch = pr.head?.ref || 'feature';
    const prUrl = pr.html_url || `https://github.com/${repoFullName}/pull/${prNumber}`;
    const now = new Date().toISOString();

    // Check existing contribution record
    const existing = db.prepare('SELECT * FROM contributions WHERE pr_number = ? AND program_id = ?').get(prNumber, policy.id) as any;

    // SCENARIO A: PR OPENED or SYNCHRONIZED
    if (action === 'opened' || action === 'synchronize') {
      const contribId = existing?.id || ('contrib_' + crypto.randomBytes(6).toString('hex'));
      const status = 'RECEIVED';
      const explanation = action === 'opened'
        ? `PR #${prNumber} received from @${contributor}. Waiting for review, CI checks, and merge into '${policy.targetBranch}'.`
        : `PR #${prNumber} synchronized with new commits. Waiting for merge.`;

      if (existing) {
        db.prepare(`
          UPDATE contributions
          SET pr_title = ?, changed_files_count = ?, additions = ?, deletions = ?,
              head_branch = ?, verification_status = ?, ai_explanation = ?, updated_at = ?
          WHERE id = ?
        `).run(
          prTitle,
          pr.changed_files || 0,
          pr.additions || 0,
          pr.deletions || 0,
          headBranch,
          status,
          explanation,
          now,
          contribId
        );
      } else {
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
          prTitle,
          prUrl,
          contributor,
          pr.user?.avatar_url || null,
          baseBranch,
          headBranch,
          pr.changed_files || 0,
          pr.additions || 0,
          pr.deletions || 0,
          null,
          'pending',
          0,
          0,
          50.0,
          status,
          JSON.stringify([]),
          JSON.stringify({ action, baseBranch, headBranch }),
          explanation,
          0, // LIVE GITHUB EVENT
          now,
          now
        );
      }

      AuditService.log({
        eventType: 'CONTRIBUTION_EVALUATED',
        actor: 'github_webhook',
        decision: 'PROCESSED',
        programId: policy.id,
        contributionId: contribId,
        details: `Recorded PR #${prNumber} (${action}) in RECEIVED status.`
      });

      res.status(200).json({ status, message: explanation, contributionId: contribId });
      return;
    }

    // SCENARIO B: PR CLOSED (MERGED or UNMERGED)
    if (action === 'closed') {
      const isMerged = Boolean(pr.merged);
      const contribId = existing?.id || ('contrib_' + crypto.randomBytes(6).toString('hex'));

      // If closed without merging: REJECT
      if (!isMerged) {
        const rejectionExplanation = `Pull request #${prNumber} was closed without being merged into '${policy.targetBranch}'. Not eligible for rewards.`;
        
        if (existing) {
          db.prepare(`
            UPDATE contributions
            SET verification_status = 'REJECTED', ai_explanation = ?, updated_at = ?
            WHERE id = ?
          `).run(rejectionExplanation, now, contribId);
        } else {
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
            contribId, policy.id, deliveryId, prNumber, prTitle, prUrl,
            contributor, pr.user?.avatar_url || null, baseBranch, headBranch,
            pr.changed_files || 0, pr.additions || 0, pr.deletions || 0, null,
            'none', 0, 0, 0, 'REJECTED', JSON.stringify(['UNMERGED_PR']),
            JSON.stringify({ unmerged: true }), rejectionExplanation, 0, now, now
          );
        }

        AuditService.log({
          eventType: 'CONTRIBUTION_EVALUATED',
          actor: 'github_webhook',
          decision: 'REJECTED',
          programId: policy.id,
          contributionId: contribId,
          details: rejectionExplanation
        });

        res.status(200).json({ status: 'REJECTED', message: rejectionExplanation });
        return;
      }

      // PR IS MERGED: First update or insert record with status 'VERIFYING'
      if (existing) {
        db.prepare(`
          UPDATE contributions
          SET verification_status = 'VERIFYING',
              ai_explanation = 'Verifying contribution evidence from GitHub REST API...',
              updated_at = ?
          WHERE id = ?
        `).run(now, contribId);
      } else {
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
          contribId, policy.id, deliveryId, prNumber, prTitle, prUrl,
          contributor, pr.user?.avatar_url || null, baseBranch, headBranch,
          pr.changed_files || 0, pr.additions || 0, pr.deletions || 0, pr.merged_at || now,
          'pending', 0, 0, 0, 'VERIFYING', JSON.stringify([]),
          JSON.stringify({ status: 'fetching_evidence' }), 'Verifying contribution evidence from GitHub REST API...',
          0, now, now
        );
      }

      // Collect ground-truth evidence via GitHub REST API (No silent fallback to demo data)
      let evidence: any;
      try {
        if (!owner || !repoName) {
          throw new Error('Repository owner or name is missing from pull_request payload');
        }
        evidence = await GitHubService.collectEvidence(owner, repoName, prNumber);
      } catch (fetchErr: any) {
        const errorMsg = `Failed to fetch ground-truth evidence from GitHub API: ${fetchErr.message}. Marked for manual review.`;
        console.warn(`[GitHubService] ${errorMsg}`);

        db.prepare(`
          UPDATE contributions
          SET verification_status = 'NEEDS_REVIEW',
              fraud_flags = ?,
              ai_explanation = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          JSON.stringify(['EVIDENCE_FETCH_FAILED']),
          errorMsg,
          new Date().toISOString(),
          contribId
        );

        AuditService.log({
          eventType: 'CONTRIBUTION_EVALUATED',
          actor: 'github_webhook',
          decision: 'REVIEW_REQUIRED',
          programId: policy.id,
          contributionId: contribId,
          details: errorMsg
        });

        res.status(200).json({
          status: 'NEEDS_REVIEW',
          contributionId: contribId,
          score: 0,
          explanation: errorMsg,
          requiresManualReview: true,
          purchaseInitiated: false
        });
        return;
      }

      const approvingMaintainers: string[] = evidence.approvingMaintainers || [];
      const maintainerApproved = approvingMaintainers.length > 0;
      const selfApproved = approvingMaintainers.includes(contributor);
      const ciStatus: 'passed' | 'failed' | 'pending' = evidence.ciPassed ? 'passed' : 'failed';
      const hasTestFiles = evidence.hasTestFiles;
      const commitCount = evidence.commits?.length || 1;
      let extractedRecipient = evidence.extractedRecipient || GitHubService.extractRecipientDirective(pr.body);

      // Check stored recipient mapping
      const storedRecipient = db.prepare('SELECT * FROM contributor_recipients WHERE LOWER(contributor_username) = LOWER(?)').get(contributor) as any;
      if (storedRecipient) {
        extractedRecipient = {
          email: storedRecipient.recipient_email || extractedRecipient?.email,
          phone: storedRecipient.recipient_phone || extractedRecipient?.phone
        };
      }

      const additions = typeof evidence.pr?.additions === 'number' ? evidence.pr.additions : (pr.additions || 0);
      const deletions = typeof evidence.pr?.deletions === 'number' ? evidence.pr.deletions : (pr.deletions || 0);
      const changedFilesCount = typeof evidence.pr?.changedFiles === 'number' ? evidence.pr.changedFiles : (pr.changed_files || 1);
      const resolvedPrTitle = evidence.pr?.title || prTitle;
      const resolvedBaseBranch = evidence.pr?.baseRef || baseBranch;

      const contribInput: ContributionInput = {
        repository: repoFullName,
        prNumber,
        prTitle: resolvedPrTitle,
        contributor,
        baseBranch: resolvedBaseBranch,
        merged: Boolean(evidence.pr?.merged ?? pr.merged),
        ciStatus,
        maintainerApproved,
        selfApproved,
        approvingMaintainers,
        hasTestFiles,
        commitCount,
        additions,
        deletions,
        changedFilesCount,
      };

      const evalResult = EvaluationService.evaluateContribution(contribInput, policy);

      const evidencePayload = {
        ruleChecks: evalResult.ruleChecks,
        rubricEvaluation: evalResult.rubricEvaluation,
        approvingMaintainers,
        hasTestFiles,
        commitCount,
        recipient: extractedRecipient,
        commits: (evidence.commits || []).map((c: any) => ({ sha: c.sha ? c.sha.slice(0, 7) : '', message: c.message })),
        files: (evidence.files || []).map((f: any) => f.filename)
      };

      const finishTime = new Date().toISOString();
      db.prepare(`
        UPDATE contributions
        SET pr_title = ?, changed_files_count = ?, additions = ?, deletions = ?,
            merged_at = ?, ci_status = ?, maintainer_approved = ?, self_approved = ?,
            evaluation_score = ?, verification_status = ?, fraud_flags = ?,
            evidence_details = ?, ai_explanation = ?, reward_tier = ?,
            suggested_reward_usd = ?, suggested_product_id = ?,
            suggested_package_value = ?, approval_status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        resolvedPrTitle,
        changedFilesCount,
        additions,
        deletions,
        evidence.pr?.mergedAt || pr.merged_at || finishTime,
        ciStatus,
        maintainerApproved ? 1 : 0,
        selfApproved ? 1 : 0,
        evalResult.score,
        evalResult.status,
        JSON.stringify(evalResult.fraudFlags),
        JSON.stringify(evidencePayload),
        evalResult.explanation,
        evalResult.rewardTier,
        evalResult.suggestedRewardUsd,
        evalResult.suggestedProductId,
        evalResult.suggestedPackageValue,
        evalResult.approvalStatus,
        finishTime,
        contribId
      );

      AuditService.log({
        eventType: evalResult.status === 'FRAUD_FLAGGED' ? 'FRAUD_PREVENTED' : 'CONTRIBUTION_EVALUATED',
        actor: 'github_webhook',
        decision: evalResult.status === 'VERIFIED' ? 'AUTHORIZED' : 'REVIEW_REQUIRED',
        programId: policy.id,
        contributionId: contribId,
        details: `PR #${prNumber} evaluated: status=${evalResult.status}, score=${evalResult.score}, tier=${evalResult.rewardTier}. ${evalResult.explanation}`
      });

      // Automated Fulfillment Execution when policy permits auto-fulfillment:
      let purchaseResult = null;
      let purchaseInitiated = false;

      if (policy.autoFulfill && evalResult.status === 'VERIFIED' && evalResult.approvalStatus === 'NOT_REQUIRED') {
        const autoPurchaseAllowed = (process.env.AUTO_PURCHASE_ENABLED || '').trim() === 'true';
        if (autoPurchaseAllowed) {
          try {
            purchaseResult = await BitrefillService.executePurchase({
              contributionId: contribId,
              productId: evalResult.suggestedProductId || 'swiggy-money-india',
              packageValue: evalResult.suggestedPackageValue || '50',
              recipientEmail: extractedRecipient?.email,
              recipientPhone: extractedRecipient?.phone,
              intentPurpose: `Autonomous reward for PR #${prNumber}`,
              manualApproval: false,
              confirmedByAdmin: true,
              approvedBy: 'autonomous_engine'
            });
            purchaseInitiated = true;
          } catch (purchaseErr: any) {
            AuditService.log({
              eventType: 'PURCHASE_FAILED',
              actor: 'autonomous_engine',
              decision: 'ERROR',
              programId: policy.id,
              contributionId: contribId,
              details: `Autonomous fulfillment failed: ${purchaseErr.message}`
            });
          }
        } else {
          AuditService.log({
            eventType: 'POLICY_AUTHORIZED',
            actor: 'autonomous_engine',
            decision: 'REVIEW_REQUIRED',
            programId: policy.id,
            contributionId: contribId,
            details: `Auto-purchase disabled by spend guardrails (AUTO_PURCHASE_ENABLED=false). Awaiting administrative sign-off.`
          });
        }
      }

      res.status(200).json({
        status: evalResult.status,
        contributionId: contribId,
        score: evalResult.score,
        rewardTier: evalResult.rewardTier,
        suggestedRewardUsd: evalResult.suggestedRewardUsd,
        approvalStatus: evalResult.approvalStatus,
        ruleChecks: evalResult.ruleChecks,
        explanation: evalResult.explanation,
        purchaseInitiated,
        purchase: purchaseResult
      });
      return;
    }
  }

  // Handle other webhook events (e.g. check_run / check_suite)
  res.status(200).json({ status: 'ignored', message: `Event '${eventType}' processed.` });
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
    owner: programRow.owner || 'Community',
    fundingSource: programRow.funding_source || 'Treasury',
    description: programRow.description,
    repository: programRow.repository,
    targetBranch: programRow.target_branch,
    minScore: programRow.min_score,
    requireCiPass: Boolean(programRow.require_ci_pass),
    requireMaintainerApproval: Boolean(programRow.require_maintainer_approval),
    allowSelfApproval: Boolean(programRow.allow_self_approval),
    perContributionRewardUsd: programRow.per_contribution_reward_usd,
    approvalThresholdUsd: programRow.approval_threshold_usd ?? 1.00,
    dailyBudgetUsd: programRow.daily_budget_usd,
    totalBudgetUsd: programRow.total_budget_usd,
    spentTodayUsd: programRow.spent_today_usd,
    totalSpentUsd: programRow.total_spent_usd,
    allowedProductIds: JSON.parse(programRow.allowed_product_ids || '[]'),
    autoFulfill: Boolean(programRow.auto_fulfill),
    active: Boolean(programRow.active),
    rubricCriteria: programRow.rubric_criteria ? JSON.parse(programRow.rubric_criteria) : [],
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
    JSON.stringify({ ruleChecks: evalResult.ruleChecks, isSimulation: true }),
    evalResult.explanation,
    1, // is_demo = 1 (SIMULATION SEED)
    now,
    now
  );

  AuditService.log({
    eventType: evalResult.status === 'FRAUD_FLAGGED' ? 'FRAUD_PREVENTED' : 'CONTRIBUTION_EVALUATED',
    actor: 'demo_simulator',
    decision: evalResult.status === 'VERIFIED' ? 'AUTHORIZED' : 'REJECTED',
    programId: policy.id,
    contributionId: contribId,
    details: `[DEMO SIMULATION] PR #${data.prNumber}: ${evalResult.explanation}`
  });

  res.json({
    status: 'simulated',
    contributionId: contribId,
    score: evalResult.score,
    verificationStatus: evalResult.status,
    fraudFlags: evalResult.fraudFlags,
    explanation: evalResult.explanation
  });
});
