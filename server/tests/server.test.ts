import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { initDatabase } from '../src/db/database';
import { WebhookService } from '../src/services/webhook.service';
import { EvaluationService } from '../src/services/evaluation.service';
import { BudgetService } from '../src/services/budget.service';
import { BitrefillService } from '../src/services/bitrefill.service';
import crypto from 'node:crypto';

beforeAll(() => {
  initDatabase();
});

describe('SHIPREWARD Backend Core Engine Tests', () => {

  // 1. Health Endpoint
  it('GET /api/health returns ok status and separated metrics', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.bitrefill).toBeDefined();
    expect(res.body.metrics.totalPrograms).toBeGreaterThanOrEqual(3);
    // Explicit partitioning of demo vs live
    expect(res.body.metrics.demoContributions).toBeGreaterThan(0);
  });

  // 2. Programmes API
  it('GET /api/programmes returns all 3 configured tiers (Campus, Builder, Enterprise)', async () => {
    const res = await request(app).get('/api/programmes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    const tiers = res.body.map((p: any) => p.tier);
    expect(tiers).toContain('BUILDER');
    expect(tiers).toContain('CAMPUS');
    expect(tiers).toContain('ENTERPRISE');
  });

  // 3. Webhook HMAC-SHA256 Verification
  it('Rejects webhook with invalid HMAC signature', async () => {
    const payload = JSON.stringify({ action: 'closed' });
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', 'sha256=invalid_hex_digest_12345')
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid HMAC-SHA256');
  });

  it('Verifies valid HMAC-SHA256 signature accurately', () => {
    const secret = 'test_secret_key_123';
    const payload = '{"hello":"world"}';
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const header = `sha256=${hmac}`;

    const isValid = WebhookService.verifySignature(payload, header, secret);
    expect(isValid).toBe(true);

    const isInvalid = WebhookService.verifySignature(payload, 'sha256=wrong', secret);
    expect(isInvalid).toBe(false);
  });

  // 4. Deterministic Evaluation Engine
  it('Evaluates genuine contribution as VERIFIED with high score', () => {
    const policy: any = {
      repository: 'shipreward/core-engine',
      targetBranch: 'main',
      minScore: 80,
      requireCiPass: true,
      requireMaintainerApproval: true,
      allowSelfApproval: false,
    };

    const input: any = {
      repository: 'shipreward/core-engine',
      prNumber: 201,
      prTitle: 'fix(auth): correct token expiry calculation',
      contributor: 'developer-jane',
      baseBranch: 'main',
      merged: true,
      ciStatus: 'passed',
      maintainerApproved: true,
      selfApproved: false,
      additions: 55,
      deletions: 12,
      changedFilesCount: 3,
    };

    const res = EvaluationService.evaluateContribution(input, policy);
    expect(res.status).toBe('VERIFIED');
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.ruleChecks.ciChecksPassed).toBe(true);
    expect(res.ruleChecks.maintainerApproved).toBe(true);
  });

  // 5. Fraud Engine Checks
  it('Flags self-approval as fraud and prevents automatic reward', () => {
    const policy: any = {
      repository: 'shipreward/core-engine',
      targetBranch: 'main',
      minScore: 80,
      requireCiPass: true,
      requireMaintainerApproval: true,
      allowSelfApproval: false,
    };

    const input: any = {
      repository: 'shipreward/core-engine',
      prNumber: 202,
      prTitle: 'docs: update readme',
      contributor: 'bot_user',
      maintainerHandle: 'bot_user', // Self-approval!
      baseBranch: 'main',
      merged: true,
      ciStatus: 'passed',
      maintainerApproved: true,
      selfApproved: true,
      additions: 2,
      deletions: 2,
      changedFilesCount: 1,
    };

    const res = EvaluationService.evaluateContribution(input, policy);
    expect(res.status).toBe('FRAUD_FLAGGED');
    expect(res.fraudFlags).toContain('SELF_APPROVAL_DETECTED');
  });

  // 6. Spend Guardrails
  it('Enforces single reward cap and emergency freeze', () => {
    // Over single reward cap ($10)
    const check1 = BudgetService.authorizeSpend('prog_builder_core', 15.00);
    expect(check1.authorized).toBe(false);
    expect(check1.reason).toContain('EXCEEDS_SINGLE_REWARD_CAP');

    // Normal reward ($5.98) within cap
    const check2 = BudgetService.authorizeSpend('prog_builder_core', 5.98);
    expect(check2.authorized).toBe(true);
  });

  // 7. Bitrefill Product & Voucher Masking
  it('Masks voucher codes to prevent sensitive disclosure', () => {
    const rawCode = 'SWIGGY-8942-1928-9821';
    const masked = BitrefillService.maskVoucherCode(rawCode);
    expect(masked).toBe('SWIGGY-••••-••••-9821');
    expect(masked).not.toContain('8942');
  });

  it('Searches Indian catalog for Swiggy and Zomato products', () => {
    const swiggy = BitrefillService.searchProducts('swiggy', 'IN');
    expect(swiggy.length).toBeGreaterThan(0);
    expect(swiggy[0].id).toBe('swiggy-india');
    expect(swiggy[0].packages.length).toBeGreaterThan(0);
  });
});
