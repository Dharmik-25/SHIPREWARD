import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db/database';
import { GitHubService } from '../src/services/github.service';
import { BitrefillService } from '../src/services/bitrefill.service';
import { VoucherSecurityService } from '../src/services/voucher-security.service';
import crypto from 'node:crypto';

const TEST_SECRET = 'shipreward_test_webhook_secret_2026';

function signPayload(payload: string, secret = TEST_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

describe('Phase 7 — Safe Automated End-to-End Pipeline Integration', () => {
  const prevSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const prevAutoPurchase = process.env.AUTO_PURCHASE_ENABLED;
  const testRepo = 'Dharmik-25/SHIPREWARD';
  const testProgramId = 'prog_builder_core';

  beforeAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = prevSecret;
    process.env.AUTO_PURCHASE_ENABLED = prevAutoPurchase;
  });

  it('1. Valid webhook is accepted with HMAC-SHA256 signature', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 7701,
        title: 'feat: add telemetry hooks',
        html_url: `https://github.com/${testRepo}/pull/7701`,
        user: { login: 'contributor_alice' },
        base: { ref: 'main', repo: { full_name: testRepo } },
        head: { ref: 'feat/telemetry' },
        changed_files: 3,
        additions: 45,
        deletions: 5
      }
    };

    const raw = JSON.stringify(payload);
    const sig = signPayload(raw);
    const deliveryId = 'deliv_e2e_test_opened_' + Date.now();

    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
    expect(res.body.contributionId).toBeDefined();

    // Clean up
    db.prepare('DELETE FROM contributions WHERE pr_number = 7701').run();
    db.prepare('DELETE FROM processed_webhooks WHERE delivery_id = ?').run(deliveryId);
  });

  it('2. Duplicate webhook delivery is detected and ignored idempotently', async () => {
    const deliveryId = 'deliv_e2e_duplicate_' + Date.now();
    const payload = {
      action: 'opened',
      pull_request: {
        number: 7702,
        title: 'fix: edge case',
        html_url: `https://github.com/${testRepo}/pull/7702`,
        user: { login: 'contributor_bob' },
        base: { ref: 'main', repo: { full_name: testRepo } },
        head: { ref: 'fix/edge' }
      }
    };

    const raw = JSON.stringify(payload);
    const sig = signPayload(raw);

    // First call
    const res1 = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(res1.status).toBe(200);

    // Duplicate call with exact same delivery ID
    const res2 = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored');
    expect(res2.body.message).toContain('Duplicate webhook delivery ID');

    // Clean up
    db.prepare('DELETE FROM contributions WHERE pr_number = 7702').run();
    db.prepare('DELETE FROM processed_webhooks WHERE delivery_id = ?').run(deliveryId);
  });

  it('3. PR closed & merged triggers evidence collection, rubric evaluation, tier mapping, and budget checks', async () => {
    const prNumber = 7703;
    const deliveryId = 'deliv_e2e_merged_' + Date.now();

    // Mock GitHubService.collectEvidence to return deterministic evidence
    const collectEvidenceSpy = vi.spyOn(GitHubService, 'collectEvidence').mockResolvedValueOnce({
      pr: {
        number: prNumber,
        title: 'feat(core): implement deterministic state sync',
        author: 'engineer_dave',
        baseRef: 'main',
        headRef: 'feat/sync',
        merged: true,
        mergedAt: new Date().toISOString(),
        additions: 60,
        deletions: 10,
        changedFiles: 3
      },
      commits: [{ sha: 'c1a2b3c', message: 'feat: add sync engine' }],
      files: [{ filename: 'src/sync.ts' }, { filename: 'tests/sync.test.ts' }],
      hasTestFiles: true,
      approvingMaintainers: ['lead_maintainer'],
      ciPassed: true,
      extractedRecipient: { email: 'dave@contributor.io' }
    });

    const payload = {
      action: 'closed',
      pull_request: {
        number: prNumber,
        title: 'feat(core): implement deterministic state sync',
        html_url: `https://github.com/${testRepo}/pull/${prNumber}`,
        user: { login: 'engineer_dave' },
        base: { ref: 'main', repo: { full_name: testRepo } },
        head: { ref: 'feat/sync' },
        merged: true,
        merged_at: new Date().toISOString(),
        changed_files: 3,
        additions: 60,
        deletions: 10
      }
    };

    const raw = JSON.stringify(payload);
    const sig = signPayload(raw);

    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.score).toBeGreaterThanOrEqual(80);
    expect(['GOOD', 'EXCELLENT', 'EXCEPTIONAL']).toContain(res.body.rewardTier);
    expect(res.body.suggestedRewardUsd).toBeGreaterThan(0);
    expect(collectEvidenceSpy).toHaveBeenCalled();

    // Verify row in DB
    const contrib = db.prepare('SELECT * FROM contributions WHERE pr_number = ?').get(prNumber) as any;
    expect(contrib).toBeDefined();
    expect(contrib.verification_status).toBe('VERIFIED');
    expect(contrib.program_id).toBe(testProgramId);
    expect(contrib.suggested_product_id).toBe('swiggy-money-india');

    // Clean up
    collectEvidenceSpy.mockRestore();
    db.prepare('DELETE FROM contributions WHERE pr_number = ?').run(prNumber);
    db.prepare('DELETE FROM processed_webhooks WHERE delivery_id = ?').run(deliveryId);
  });

  it('4. Full autonomous fulfillment flow: Mocked Bitrefill purchase, encryption, and zero raw secret leakage', async () => {
    const prNumber = 7704;
    const testContribId = `contrib_e2e_fulfillment_${Date.now()}`;
    const testDeliveryId = `deliv_e2e_fulfill_mock_${Date.now()}`;

    // Insert verified contribution
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, github_delivery_id, pr_number, pr_title, pr_url,
        contributor, base_branch, head_branch, changed_files_count,
        additions, deletions, merged_at, ci_status, maintainer_approved,
        self_approved, evaluation_score, verification_status, fraud_flags,
        evidence_details, ai_explanation, reward_tier, suggested_reward_usd,
        suggested_product_id, suggested_package_value, approval_status,
        is_demo, created_at, updated_at
      ) VALUES (
        ?, 'prog_builder_core', ?, ?, 'feat(security): hardened vault',
        'https://github.com/Dharmik-25/SHIPREWARD/pull/7704', 'audit_dev', 'main', 'feat/vault',
        2, 40, 5, datetime('now'), 'passed', 1,
        0, 85, 'VERIFIED', '[]',
        '{}', 'Verified high-quality contribution', 'GOOD', 0.55,
        'swiggy-money-india', '50', 'NOT_REQUIRED',
        1, datetime('now'), datetime('now')
      )
    `).run(testContribId, testDeliveryId, prNumber);

    // Execute mock Bitrefill purchase with isDemo = true (NEVER touches real balance)
    const result = await BitrefillService.executePurchase({
      contributionId: testContribId,
      productId: 'swiggy-money-india',
      packageValue: '50',
      intentPurpose: 'E2E Pipeline Test Fulfillment',
      manualApproval: true,
      confirmedByAdmin: true,
      approvedBy: 'automated_e2e_tester',
      isDemo: true
    });

    expect(result.orderStatus).toBe('delivered');
    expect(result.invoiceStatus).toBe('complete');
    expect(result.priceUsd).toBe(0.55);
    expect(result.maskedVoucherCode).toMatch(/^SWIGGY-.*[0-9A-Z]{4}$/);

    // Verify stored in DB
    const rewardRow = db.prepare('SELECT * FROM rewards WHERE contribution_id = ?').get(testContribId) as any;
    expect(rewardRow).toBeDefined();
    expect(rewardRow.order_status).toBe('delivered');
    expect(rewardRow.encrypted_voucher_payload).toBeDefined();
    expect(rewardRow.voucher_iv).toBeDefined();
    expect(rewardRow.voucher_auth_tag).toBeDefined();

    // Verify Decryption works with master key
    const decrypted = VoucherSecurityService.decrypt({
      encryptedPayload: rewardRow.encrypted_voucher_payload,
      iv: rewardRow.voucher_iv,
      authTag: rewardRow.voucher_auth_tag
    });
    expect(decrypted.code).toMatch(/^SWIGGY-[A-Z0-9]+-[A-Z0-9]+$/);

    // Verify GET /api/rewards never leaks raw unencrypted voucher code
    const apiRes = await request(app).get('/api/rewards');
    expect(apiRes.status).toBe(200);
    const foundReward = apiRes.body.find((r: any) => r.id === rewardRow.id);
    expect(foundReward).toBeDefined();
    expect(foundReward.maskedVoucherCode).toBe(rewardRow.masked_voucher_code);
    expect(foundReward.encryptedPayload).toBeUndefined();
    expect(foundReward.code).toBeUndefined();
    expect(JSON.stringify(apiRes.body)).not.toContain(decrypted.code);

    // Verify Duplicate purchase prevention: attempting to purchase again on same contribution fails
    await expect(BitrefillService.executePurchase({
      contributionId: testContribId,
      productId: 'swiggy-money-india',
      packageValue: '50',
      intentPurpose: 'Duplicate Attempt',
      manualApproval: true,
      confirmedByAdmin: true,
      isDemo: true
    })).rejects.toThrow(/Duplicate purchase prevented/);

    // Clean up
    db.prepare('DELETE FROM rewards WHERE contribution_id = ?').run(testContribId);
    db.prepare('DELETE FROM contributions WHERE id = ?').run(testContribId);
  });
});
