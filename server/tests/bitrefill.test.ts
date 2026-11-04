import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { initDatabase, db } from '../src/db/database';
import { BitrefillService, DISCOVERED_MCP_TOOLS } from '../src/services/bitrefill.service';
import { BitrefillMcpService } from '../src/services/bitrefill-mcp.service';
import { BudgetService } from '../src/services/budget.service';
import { VoucherSecurityService } from '../src/services/voucher-security.service';

beforeAll(() => {
  initDatabase();
});

describe('Phase 4.1 — Bitrefill MCP Integration, Spend Guardrails & Voucher Security Tests', () => {

  // 1. Connection Health Distinguishes UNCONFIGURED, CONNECTED, and ERROR
  it('GET /api/bitrefill/status reports UNCONFIGURED when no API key is provided', async () => {
    const savedKey = process.env.BITREFILL_API_KEY;
    delete process.env.BITREFILL_API_KEY;
    const res = await request(app).get('/api/bitrefill/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unconfigured');
    expect(res.body.hasApiKey).toBe(false);
    expect(res.body.tools).toEqual(expect.arrayContaining(DISCOVERED_MCP_TOOLS));
    process.env.BITREFILL_API_KEY = savedKey;
  });

  it('GET /api/bitrefill/status reports ERROR when credentials fail with 401', async () => {
    const savedKey = process.env.BITREFILL_API_KEY;
    process.env.BITREFILL_API_KEY = 'invalid_mock_api_key_401';
    
    // Mock MCP handshake to return error
    const originalHandshake = BitrefillMcpService.handshake;
    BitrefillMcpService.handshake = vi.fn().mockResolvedValue({
      status: 'error',
      endpoint: 'https://api.bitrefill.com/mcp',
      tools: [],
      hasApiKey: true,
      latencyMs: 10,
      error: 'Unauthorized (401)'
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v2/ping')) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized'
        } as any;
      }
      return originalFetch(url);
    });

    const res = await request(app).get('/api/bitrefill/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.hasApiKey).toBe(true);

    global.fetch = originalFetch;
    BitrefillMcpService.handshake = originalHandshake;
    process.env.BITREFILL_API_KEY = savedKey;
  });

  // 2. Product Discovery: search-products
  it('GET /api/bitrefill/products returns real confirmed India digital products', async () => {
    const res = await request(app).get('/api/bitrefill/products?country=IN');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const productIds = res.body.map((p: any) => p.id);
    expect(productIds).toContain('swiggy-money-india');
    expect(productIds).toContain('airtel-india');
    expect(productIds).toContain('zomato-india');
    expect(productIds).toContain('jio-india');
  });

  it('GET /api/bitrefill/products?q=airtel searches by query', async () => {
    const res = await request(app).get('/api/bitrefill/products?q=airtel&country=IN');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].id).toBe('airtel-india');
    expect(res.body[0].recipient_type).toBe('phone_number');
  });

  // 3. Product Details: get-product-details with exact denominations and USD pricing
  it('GET /api/bitrefill/products/:id returns exact package values and USD payment price', async () => {
    const resAirtel = await request(app).get('/api/bitrefill/products/airtel-india');
    expect(resAirtel.status).toBe(200);
    expect(resAirtel.body.id).toBe('airtel-india');
    expect(resAirtel.body.recipient_type).toBe('phone_number');
    expect(resAirtel.body.in_stock).toBe(true);

    // Exact confirmed package: ₹10 talktime -> $0.11 USD
    const pkg10 = resAirtel.body.packages.find((p: any) => p.package_value === '10');
    expect(pkg10).toBeDefined();
    expect(pkg10.package_currency).toBe('INR');
    expect(pkg10.payment_price).toBe('0.11');
    expect(pkg10.payment_currency).toBe('USD');

    // Exact confirmed package: ₹50 Swiggy voucher -> $0.55 USD
    const resSwiggy = await request(app).get('/api/bitrefill/products/swiggy-money-india');
    expect(resSwiggy.status).toBe(200);
    const pkg50 = resSwiggy.body.packages.find((p: any) => p.package_value === '50');
    expect(pkg50).toBeDefined();
    expect(pkg50.package_currency).toBe('INR');
    expect(pkg50.payment_price).toBe('0.55');
  });

  // 4. Strict Spend Guardrail: Single Reward Cap Rejection ($0.60 USD)
  it('Rejects purchase if price exceeds strict single reward cap ($0.60 USD)', () => {
    const savedDaily = process.env.SPEND_CAP_DAILY_USD;
    process.env.SPEND_CAP_DAILY_USD = '5.00';
    process.env.SPEND_CAP_SINGLE_REWARD_USD = '0.60';
    process.env.EMERGENCY_PURCHASE_FREEZE = 'false';

    const testContribId = 'contrib_test_cap_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 901, 'test', 'http://pr', 'test_user', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    // Package '100' on Swiggy costs $1.10 USD (exceeds $0.60 cap)
    const result100 = BitrefillService.validateGuardrails({
      contributionId: testContribId,
      productId: 'swiggy-money-india',
      packageValue: '100',
      manualApproval: true
    });
    expect(result100.authorized).toBe(false);
    expect(result100.reason).toContain('EXCEEDS_SINGLE_REWARD_CAP');

    // Package '50' on Swiggy costs $0.55 USD (within $0.60 cap)
    const result50 = BitrefillService.validateGuardrails({
      contributionId: testContribId,
      productId: 'swiggy-money-india',
      packageValue: '50',
      manualApproval: true
    });
    expect(result50.authorized).toBe(true);
    expect(result50.priceUsd).toBe(0.55);

    process.env.SPEND_CAP_DAILY_USD = savedDaily;
  });

  // 5. Guardrail: Emergency Purchase Freeze
  it('Blocks purchases when emergency purchase freeze is armed', () => {
    process.env.EMERGENCY_PURCHASE_FREEZE = 'true';

    const testContribId = 'contrib_test_freeze_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 902, 'test freeze', 'http://pr', 'test_user2', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    const result = BitrefillService.validateGuardrails({
      contributionId: testContribId,
      productId: 'airtel-india',
      packageValue: '10',
      manualApproval: true
    });

    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('Emergency purchase freeze is active');

    process.env.EMERGENCY_PURCHASE_FREEZE = 'false';
  });

  // 6. Guardrail: Duplicate Purchase Prevention
  it('Prevents duplicate reward fulfillment on the same contribution', () => {
    process.env.EMERGENCY_PURCHASE_FREEZE = 'false';

    const testContribId = 'contrib_test_dupe_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 903, 'test dupe', 'http://pr', 'test_user3', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    // Insert existing reward
    const rewardId = 'rew_dupe_test_' + Date.now();
    db.prepare(`
      INSERT INTO rewards (
        id, contribution_id, program_id, contributor, product_id, product_name,
        package_value, package_currency, price_usd, invoice_id, invoice_status,
        order_id, order_status, is_demo, created_at
      ) VALUES (?, ?, 'prog_builder_core', 'test_user3', 'airtel-india', 'Airtel India', '10', 'INR', 0.11, 'inv_123', 'complete', 'ord_123', 'delivered', 0, datetime('now'))
    `).run(rewardId, testContribId);

    const result = BitrefillService.validateGuardrails({
      contributionId: testContribId,
      productId: 'airtel-india',
      packageValue: '10',
      manualApproval: true
    });

    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('Duplicate purchase prevented');
  });

  // 7. Guardrail: Unverified Contribution Rejection
  it('Rejects reward fulfillment if contribution is NOT in VERIFIED status', () => {
    process.env.EMERGENCY_PURCHASE_FREEZE = 'false';

    const testContribId = 'contrib_test_unverified_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 904, 'test unverified', 'http://pr', 'test_user4', 'main', 'feat', 1, 10, 5, 'passed', 0, 0, 50, 'NEEDS_REVIEW', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    const result = BitrefillService.validateGuardrails({
      contributionId: testContribId,
      productId: 'airtel-india',
      packageValue: '10',
      manualApproval: true
    });

    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('not in VERIFIED status');
  });

  // 8. Auto-Purchase Disabled Enforcement
  it('Rejects purchase if AUTO_PURCHASE_ENABLED=false and no explicit admin confirmation is provided', async () => {
    process.env.AUTO_PURCHASE_ENABLED = 'false';

    const testContribId = 'contrib_test_no_confirm_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 905, 'test auto disabled', 'http://pr', 'test_user5', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    const res = await request(app)
      .post('/api/bitrefill/execute-reward')
      .send({
        contributionId: testContribId,
        productId: 'swiggy-money-india',
        packageValue: '50'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('EXECUTION_REJECTED: Auto-purchase is disabled');
  });

  // 9. Purchase Preview Endpoint Returns Breakdown Without Executing
  it('POST /api/bitrefill/preview-purchase returns transparent breakdown without buying', async () => {
    const testContribId = 'contrib_test_preview_' + Date.now();
    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 906, 'preview test', 'http://pr', 'contributor_alice', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    const res = await request(app)
      .post('/api/bitrefill/preview-purchase')
      .send({
        contributionId: testContribId,
        productId: 'swiggy-money-india',
        packageValue: '50',
        recipientEmail: 'alice@example.com'
      });

    expect(res.status).toBe(200);
    expect(res.body.reward.productId).toBe('swiggy-money-india');
    expect(res.body.reward.packageValue).toBe('50');
    expect(res.body.reward.livePaymentPriceUsd).toBe(0.55);
    expect(res.body.budgetGuardrails.singleRewardCapUsd).toBe(0.60);
    expect(res.body.budgetGuardrails.withinSingleCap).toBe(true);
    expect(res.body.purchaseSafetyNotice).toContain('NO PURCHASE EXECUTED');

    // Confirm database has 0 rewards for this contribution
    const count = db.prepare('SELECT COUNT(*) as c FROM rewards WHERE contribution_id = ?').get(testContribId) as any;
    expect(count.c).toBe(0);
  });

  // 10. Voucher Encryption & Secure Contributor Claiming
  it('Encrypts sensitive voucher codes using AES-256-GCM and allows authorized contributor to claim', async () => {
    const rawCode = 'SWIGGY-8942-1928-9821';
    const envelope = VoucherSecurityService.encrypt({
      code: rawCode,
      instructions: 'Add to Swiggy wallet'
    });

    expect(envelope.encryptedPayload).toBeDefined();
    expect(envelope.encryptedPayload).not.toContain('8942');
    expect(envelope.iv).toHaveLength(24); // 12 bytes hex
    expect(envelope.authTag).toHaveLength(32); // 16 bytes hex

    const decrypted = VoucherSecurityService.decrypt(envelope);
    expect(decrypted.code).toBe(rawCode);

    // Insert a test reward with encrypted payload
    const rewardId = 'rew_secure_test_' + Date.now();
    const testContribId = 'contrib_test_sec_' + Date.now();
    const maskedCode = VoucherSecurityService.maskCode(rawCode);

    db.prepare(`
      INSERT INTO contributions (
        id, program_id, pr_number, pr_title, pr_url, contributor, base_branch, head_branch,
        changed_files_count, additions, deletions, ci_status, maintainer_approved, self_approved,
        evaluation_score, verification_status, fraud_flags, evidence_details, is_demo, created_at, updated_at
      ) VALUES (?, 'prog_builder_core', 907, 'sec test', 'http://pr', 'secure_dev', 'main', 'feat', 1, 10, 5, 'passed', 1, 0, 95, 'VERIFIED', '[]', '{}', 0, datetime('now'), datetime('now'))
    `).run(testContribId);

    db.prepare(`
      INSERT INTO rewards (
        id, contribution_id, program_id, contributor, product_id, product_name,
        package_value, package_currency, price_usd, invoice_id, invoice_status,
        order_id, order_status, masked_voucher_code, encrypted_voucher_payload,
        voucher_iv, voucher_auth_tag, is_demo, created_at
      ) VALUES (?, ?, 'prog_builder_core', 'secure_dev', 'swiggy-money-india', 'Swiggy Money India',
        '50', 'INR', 0.55, 'inv_sec_1', 'complete', 'ord_sec_1', 'delivered',
        ?, ?, ?, ?, 0, datetime('now'))
    `).run(rewardId, testContribId, maskedCode, envelope.encryptedPayload, envelope.iv, envelope.authTag);

    // Normal GET /api/rewards/:id NEVER exposes raw code or encryption keys
    const getRes = await request(app).get(`/api/rewards/${rewardId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.maskedVoucherCode).toBe('SWIGGY-••••-••••-9821');
    expect(getRes.body.encrypted_voucher_payload).toBeUndefined();
    expect(getRes.body.rawCode).toBeUndefined();

    // Unauthorized claimer is rejected with 403
    const badClaimRes = await request(app)
      .post(`/api/rewards/${rewardId}/claim`)
      .send({ claimer: 'random_hacker' });
    expect(badClaimRes.status).toBe(403);
    expect(badClaimRes.body.error).toContain('Unauthorized');

    // Authorized contributor @secure_dev claims successfully
    const goodClaimRes = await request(app)
      .post(`/api/rewards/${rewardId}/claim`)
      .send({ claimer: 'secure_dev' });
    expect(goodClaimRes.status).toBe(200);
    expect(goodClaimRes.body.success).toBe(true);
    expect(goodClaimRes.body.redemption.code).toBe(rawCode);
  });

  // 11. Health Endpoint Reflects Bitrefill Status and Configured Caps
  it('GET /api/health reflects bitrefill connection and daily spend cap ($1.00 USD)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.bitrefill.dailySpendCapUsd).toBe(1.00);
  });

  afterAll(() => {
    db.prepare("DELETE FROM rewards WHERE id LIKE 'rew_secure_test_%' OR id LIKE 'rew_dupe_test_%'").run();
    db.prepare("DELETE FROM contributions WHERE id LIKE 'contrib_test_%'").run();
  });
});
