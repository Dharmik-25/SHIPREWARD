import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { initDatabase, db } from '../src/db/database';
import { WebhookService } from '../src/services/webhook.service';
import { EvaluationService } from '../src/services/evaluation.service';
import { GitHubService } from '../src/services/github.service';
import crypto from 'node:crypto';

const TEST_SECRET = 'shipreward_test_webhook_secret_2026';

function signPayload(payload: string, secret = TEST_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

beforeAll(() => {
  process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
  initDatabase();
  // Ensure both shipreward/core-engine and Dharmik-25/SHIPREWARD are enrolled
  db.prepare(`
    INSERT OR IGNORE INTO programs (
      id, name, tier, description, repository, target_branch, min_score,
      require_ci_pass, require_maintainer_approval, allow_self_approval,
      per_contribution_reward_usd, daily_budget_usd, total_budget_usd,
      spent_today_usd, total_spent_usd, allowed_product_ids, auto_fulfill, active,
      created_at, updated_at
    ) VALUES (
      'prog_test_core', 'Test Core', 'BUILDER', 'Test program',
      'shipreward/core-engine', 'main', 70, 1, 1, 0, 5.0, 50.0, 200.0, 0, 0, '[]', 1, 1,
      datetime('now'), datetime('now')
    )
  `).run();
});

describe('Phase 3 — Real GitHub Webhook & Verification Tests', () => {

  // 1. Signature Verification
  it('Accepts webhook with valid HMAC-SHA256 signature and returns RECEIVED', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: {
        number: 301,
        title: 'feat: add distributed lock to scheduler',
        user: { login: 'octo-dev' },
        base: { ref: 'main', repo: { full_name: 'shipreward/core-engine' } },
        head: { ref: 'feature/lock' },
        changed_files: 3,
        additions: 45,
        deletions: 10
      }
    });

    const signature = signPayload(payload);
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'deliv_test_' + Date.now() + '_1')
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
  });

  it('Rejects webhook with invalid HMAC signature with 401', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', 'sha256=invalid_hash_signature_000000')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'deliv_test_bad_sig')
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid HMAC-SHA256');
  });

  // 2. Idempotency Check
  it('Ignores duplicate webhook delivery ID (idempotency enforcement)', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: {
        number: 302,
        title: 'docs: update architecture overview',
        user: { login: 'dev-alex' },
        base: { ref: 'main', repo: { full_name: 'shipreward/core-engine' } }
      }
    });

    const signature = signPayload(payload);
    const deliveryId = 'deliv_idempotent_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // First delivery
    const res1 = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', deliveryId)
      .set('content-type', 'application/json')
      .send(payload);
    expect(res1.status).toBe(200);

    // Duplicate delivery
    const res2 = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', deliveryId)
      .set('content-type', 'application/json')
      .send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored');
    expect(res2.body.message).toContain('Duplicate');
  });

  // 3. Unmerged PR Rejection
  it('Rejects unmerged PR closed event', async () => {
    const payload = JSON.stringify({
      action: 'closed',
      pull_request: {
        number: 303,
        title: 'refactor: experimental abandoned rewrite',
        user: { login: 'contributor-bob' },
        merged: false, // NOT merged!
        base: { ref: 'main', repo: { full_name: 'shipreward/core-engine' } }
      }
    });

    const signature = signPayload(payload);
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'deliv_unmerged_' + Date.now() + '_3')
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.message).toContain('without being merged');
  });

  // 4. Merged PR Evaluation & Verification
  it('Evaluates merged PR and marks VERIFIED without executing purchases', async () => {
    // Mock GitHubService.collectEvidence so it returns valid independent maintainer approval
    vi.spyOn(GitHubService, 'collectEvidence').mockResolvedValueOnce({
      pr: {
        id: 999304,
        number: 304,
        title: 'fix(worker): prevent race condition during job acknowledgment',
        body: 'Closes #300. Fixes race in worker.\n\nSHIPREWARD: alice@example.com',
        state: 'closed',
        merged: true,
        mergedAt: new Date().toISOString(),
        mergeCommitSha: 'sha999304',
        headSha: 'headsha999304',
        headRef: 'fix/ack-race',
        baseRef: 'main',
        additions: 64,
        deletions: 12,
        changedFiles: 3,
        author: { login: 'contributor-alice', avatarUrl: 'https://github.com/alice.png' }
      },
      commits: [{ sha: 'sha1', message: 'fix worker race', author: 'contributor-alice' }],
      files: [{ filename: 'src/worker.ts', additions: 50, deletions: 10, status: 'modified' }, { filename: 'tests/worker.test.ts', additions: 14, deletions: 2, status: 'added' }],
      reviews: [{ id: 1, user: { login: 'lead-maintainer' }, state: 'APPROVED', submittedAt: new Date().toISOString() }],
      approvingMaintainers: ['lead-maintainer'],
      checkRuns: [{ id: 1, name: 'build', status: 'completed', conclusion: 'success' }],
      ciPassed: true,
      hasTestFiles: true,
      extractedRecipient: { email: 'alice@example.com' }
    });

    const payload = JSON.stringify({
      action: 'closed',
      pull_request: {
        number: 304,
        title: 'fix(worker): prevent race condition during job acknowledgment',
        user: { login: 'contributor-alice' },
        merged: true,
        merged_at: new Date().toISOString(),
        base: { ref: 'main', repo: { full_name: 'shipreward/core-engine' } },
        head: { ref: 'fix/ack-race' },
        changed_files: 3,
        additions: 64,
        deletions: 12
      }
    });

    const signature = signPayload(payload);
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'deliv_merged_' + Date.now() + '_4')
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.score).toBeGreaterThanOrEqual(70);
    expect(res.body.ruleChecks.mergedIntoTarget).toBe(true);
    expect(res.body.purchaseInitiated).toBe(false);

    // Verify database record has is_demo = 0 (LIVE GITHUB EVENT)
    const record = db.prepare('SELECT * FROM contributions WHERE pr_number = 304').get() as any;
    expect(record).toBeDefined();
    expect(record.is_demo).toBe(0);
    expect(record.verification_status).toBe('VERIFIED');

    // CRITICAL: Verify NO Bitrefill purchase was created
    const rewardRecord = db.prepare('SELECT * FROM rewards WHERE contribution_id = ?').get(record.id);
    expect(rewardRecord).toBeUndefined();
  });

  // 5. Failed Remote Evidence Retrieval: NEVER fall back silently to fake/demo data
  it('Flags as NEEDS_REVIEW without silent fallback when GitHub API fails', async () => {
    vi.spyOn(GitHubService, 'collectEvidence').mockRejectedValueOnce(
      new Error('GitHub API rate limit exceeded: 403 Forbidden')
    );

    const payload = JSON.stringify({
      action: 'closed',
      pull_request: {
        number: 399,
        title: 'feat: add telemetry module',
        user: { login: 'remote-contributor' },
        merged: true,
        base: { ref: 'main', repo: { full_name: 'shipreward/core-engine' } }
      }
    });

    const signature = signPayload(payload);
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'deliv_fetch_fail_' + Date.now())
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NEEDS_REVIEW');
    expect(res.body.requiresManualReview).toBe(true);
    expect(res.body.explanation).toContain('Failed to fetch ground-truth evidence');
    expect(res.body.purchaseInitiated).toBe(false);

    // Verify DB record is marked NEEDS_REVIEW with fraud flag
    const record = db.prepare('SELECT * FROM contributions WHERE pr_number = 399').get() as any;
    expect(record).toBeDefined();
    expect(record.verification_status).toBe('NEEDS_REVIEW');
    expect(record.is_demo).toBe(0);
    expect(JSON.parse(record.fraud_flags)).toContain('EVIDENCE_FETCH_FAILED');
  });

  // 6. Anti-Fraud: Self-Approval Detection
  it('Flags self-approval as fraud and prevents reward eligibility', () => {
    const policy: any = {
      repository: 'shipreward/core-engine',
      targetBranch: 'main',
      minScore: 70,
      requireCiPass: true,
      requireMaintainerApproval: true,
      allowSelfApproval: false,
    };

    const input: any = {
      repository: 'shipreward/core-engine',
      prNumber: 306,
      prTitle: 'chore: bump minor dependencies',
      contributor: 'sneaky_dev',
      maintainerHandle: 'sneaky_dev', // Same user!
      selfApproved: true,
      baseBranch: 'main',
      merged: true,
      ciStatus: 'passed',
      maintainerApproved: true,
      additions: 15,
      deletions: 15,
      changedFilesCount: 1,
    };

    const evalResult = EvaluationService.evaluateContribution(input, policy);
    expect(evalResult.status).toBe('FRAUD_FLAGGED');
    expect(evalResult.fraudFlags).toContain('SELF_APPROVAL_DETECTED');
  });

  it('Flags self-approval detected from GitHub reviews list (approvingMaintainers)', () => {
    const policy: any = {
      repository: 'shipreward/core-engine',
      targetBranch: 'main',
      minScore: 70,
      requireCiPass: true,
      requireMaintainerApproval: true,
      allowSelfApproval: false,
    };

    const input: any = {
      repository: 'shipreward/core-engine',
      prNumber: 307,
      prTitle: 'fix(core): concurrency fix',
      contributor: 'contributor-dan',
      approvingMaintainers: ['contributor-dan'], // Author approved their own PR!
      selfApproved: false,
      baseBranch: 'main',
      merged: true,
      ciStatus: 'passed',
      maintainerApproved: true,
      additions: 25,
      deletions: 5,
      changedFilesCount: 2,
    };

    const evalResult = EvaluationService.evaluateContribution(input, policy);
    expect(evalResult.status).toBe('FRAUD_FLAGGED');
    expect(evalResult.fraudFlags).toContain('SELF_APPROVAL_DETECTED');
    expect(evalResult.ruleChecks.notSelfApproved).toBe(false);
    expect(evalResult.ruleChecks.maintainerApproved).toBe(false);
  });

  // 7. Failed CI Suite Check
  it('Rejects PR when CI tests fail', () => {
    const policy: any = {
      repository: 'shipreward/core-engine',
      targetBranch: 'main',
      minScore: 70,
      requireCiPass: true,
      requireMaintainerApproval: true,
      allowSelfApproval: false,
    };

    const input: any = {
      repository: 'shipreward/core-engine',
      prNumber: 305,
      prTitle: 'feat: add analytics webhook',
      contributor: 'dev-charlie',
      baseBranch: 'main',
      merged: true,
      ciStatus: 'failed', // CI FAILED!
      maintainerApproved: true,
      selfApproved: false,
      additions: 40,
      deletions: 5,
      changedFilesCount: 2,
    };

    const evalResult = EvaluationService.evaluateContribution(input, policy);
    expect(evalResult.status).toBe('REJECTED');
    expect(evalResult.ruleChecks.ciChecksPassed).toBe(false);
    expect(evalResult.explanation).toContain('automated CI test suites failed');
  });

  // 8. Contributor to Recipient Mapping
  it('Maps contributor username to configured reward email/phone', async () => {
    const postRes = await request(app)
      .post('/api/contributors/alex-dev/recipient')
      .send({ recipientEmail: 'alex@community.dev', recipientPhone: '919876543210' });
    expect(postRes.status).toBe(200);

    const getRes = await request(app).get('/api/contributors/alex-dev/recipient');
    expect(getRes.status).toBe(200);
    expect(getRes.body.recipientEmail).toBe('alex@community.dev');
    expect(getRes.body.recipientPhone).toBe('919876543210');
  });

  // 9. Recipient Directive Extraction
  it('Extracts recipient directives from PR body descriptions', () => {
    const body1 = 'Closes #42. Implementation of raft heartbeat.\n\nSHIPREWARD: dev@acme.org';
    const recipient1 = GitHubService.extractRecipientDirective(body1);
    expect(recipient1?.email).toBe('dev@acme.org');

    const body2 = 'Fixes typo.\n\nReward-To: 919876543210';
    const recipient2 = GitHubService.extractRecipientDirective(body2);
    expect(recipient2?.phone).toBe('919876543210');
  });

  // 10. Repo Status Endpoint
  it('GET /api/github/repo-status reports configuration health', async () => {
    const res = await request(app).get('/api/github/repo-status?repo=shipreward/core-engine');
    expect(res.status).toBe(200);
    expect(res.body.repository).toBe('shipreward/core-engine');
    expect(res.body.webhookSecretConfigured).toBe(true);
  });
});
