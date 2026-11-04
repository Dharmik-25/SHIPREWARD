import { Router, Request, Response } from 'express';
import { BitrefillService, BITREFILL_CATALOG, DISCOVERED_MCP_TOOLS, PurchaseIntent } from '../services/bitrefill.service';
import { BitrefillMcpService } from '../services/bitrefill-mcp.service';
import { db } from '../db/database';
import { AuditService } from '../services/audit.service';

export const bitrefillRouter = Router();

/**
 * GET /api/bitrefill/status & GET /api/bitrefill/health
 * Returns connection health distinguishing UNCONFIGURED, CONNECTED, and ERROR.
 * Never exposes API keys, invoice tokens, or secrets.
 */
bitrefillRouter.get('/bitrefill/status', async (req: Request, res: Response) => {
  const health = await BitrefillService.checkConnectionHealth();
  res.json({
    ...health,
    checkedAt: new Date().toISOString()
  });
});

bitrefillRouter.get('/bitrefill/health', async (req: Request, res: Response) => {
  const health = await BitrefillService.checkConnectionHealth();
  res.json({
    ...health,
    checkedAt: new Date().toISOString()
  });
});

/**
 * GET /api/bitrefill/mcp/audit
 * Comprehensive audit of the application's live MCP connection, discovered tools,
 * account balances, and live product pricing verification.
 */
bitrefillRouter.get('/bitrefill/mcp/audit', async (req: Request, res: Response) => {
  const handshake = await BitrefillMcpService.handshake();
  const balances = handshake.status === 'connected' ? await BitrefillMcpService.getAccountBalances() : [];
  const swiggyDetails = handshake.status === 'connected' ? await BitrefillMcpService.getProductDetails('swiggy-money-india') : null;

  const dailyCap = parseFloat(process.env.SPEND_CAP_DAILY_USD || '1.00');
  const singleCap = parseFloat(process.env.SPEND_CAP_SINGLE_REWARD_USD || '0.60');
  const emergencyFreeze = process.env.EMERGENCY_PURCHASE_FREEZE === 'true';
  const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED === 'true';

  // Find ₹50 package
  const pkg50 = swiggyDetails?.packages.find(p => p.package_value === '50');
  const priceUsd50 = pkg50 ? parseFloat(pkg50.payment_price) : 0.55;

  res.json({
    mcpConnection: {
      status: handshake.status,
      endpoint: handshake.endpoint,
      latencyMs: handshake.latencyMs,
      hasApiKey: handshake.hasApiKey,
      toolsDiscoveredCount: handshake.tools.length,
      tools: handshake.tools
    },
    liveAccountBalances: balances,
    preferredDemoReward: {
      productId: 'swiggy-money-india',
      productName: 'Swiggy Money India',
      denomination: '50',
      currency: 'INR',
      livePaymentPriceUsd: priceUsd50,
      paymentCurrency: 'USD',
      inStock: swiggyDetails?.in_stock ?? true,
      satisfiesSingleRewardCap: priceUsd50 <= singleCap,
      satisfiesDailyCap: priceUsd50 <= dailyCap,
      source: swiggyDetails ? 'live_mcp_streamable_http' : 'catalog_cache'
    },
    configuredGuardrails: {
      dailySpendCapUsd: dailyCap,
      singleRewardCapUsd: singleCap,
      emergencyPurchaseFreeze: emergencyFreeze,
      autoPurchaseEnabled,
      requiresExplicitAdminApproval: !autoPurchaseEnabled,
      spendingLockedUntilConfirmed: true
    },
    auditedAt: new Date().toISOString()
  });
});

/**
 * GET /api/bitrefill/products
 * Implements MCP product search flow.
 */
bitrefillRouter.get('/bitrefill/products', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const country = (req.query.country as string) || 'IN';

  // If live search requested and configured, try MCP
  if (req.query.live === 'true' && process.env.BITREFILL_API_KEY) {
    const liveResults = await BitrefillMcpService.searchProducts(query, country);
    if (liveResults.length > 0) {
      res.json(liveResults);
      return;
    }
  }

  const products = BitrefillService.searchProducts(query, country);
  res.json(products);
});

/**
 * GET /api/bitrefill/products/:id
 * Implements MCP get-product-details flow with exact package denominations & USD pricing.
 */
bitrefillRouter.get('/bitrefill/products/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const liveResult = await BitrefillService.getLiveProductDetails(id);
  if (!liveResult) {
    res.status(404).json({ error: `Product '${id}' not found in Bitrefill catalog.` });
    return;
  }
  res.json({
    ...liveResult.product,
    isLive: liveResult.isLive
  });
});

/**
 * GET /api/bitrefill/guardrails
 * Returns current spend limits, daily cap utilization, and emergency kill-switch status.
 */
bitrefillRouter.get('/bitrefill/guardrails', (req: Request, res: Response) => {
  const dailyCap = parseFloat(process.env.SPEND_CAP_DAILY_USD || '1.00');
  const singleCap = parseFloat(process.env.SPEND_CAP_SINGLE_REWARD_USD || '0.60');
  const emergencyFreeze = process.env.EMERGENCY_PURCHASE_FREEZE === 'true';
  const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED === 'true';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const spentTodayRow = db.prepare(`
    SELECT COALESCE(SUM(price_usd), 0) as s
    FROM rewards
    WHERE created_at >= ? AND is_demo = 0 AND order_status != 'failed'
  `).get(startOfToday.toISOString()) as any;
  const spentToday = spentTodayRow.s;

  res.json({
    dailySpendCapUsd: dailyCap,
    spentTodayUsd: spentToday,
    remainingTodayUsd: Math.max(0, dailyCap - spentToday),
    singleRewardCapUsd: singleCap,
    emergencyFreeze,
    autoPurchaseEnabled,
    disallowedActionsAboveCap: 'REQUIRES_MANUAL_MAINTAINER_APPROVAL'
  });
});

/**
 * POST /api/bitrefill/guardrails/freeze
 * Toggles emergency purchase freeze.
 */
bitrefillRouter.post('/bitrefill/guardrails/freeze', (req: Request, res: Response) => {
  const { freeze } = req.body;
  const shouldFreeze = Boolean(freeze);
  process.env.EMERGENCY_PURCHASE_FREEZE = shouldFreeze ? 'true' : 'false';

  AuditService.log({
    eventType: 'EMERGENCY_STOP_ACTIVATED',
    actor: 'admin_dashboard',
    decision: shouldFreeze ? 'AUTHORIZED' : 'PROCESSED',
    details: shouldFreeze 
      ? 'Emergency purchase freeze ACTIVATED by maintainer.'
      : 'Emergency purchase freeze DEACTIVATED by maintainer.'
  });

  res.json({
    emergencyFreeze: shouldFreeze,
    message: shouldFreeze ? 'Emergency freeze activated' : 'Emergency freeze cleared'
  });
});

/**
 * POST /api/bitrefill/preview-purchase
 * Evaluates guardrails for an intended reward without executing it.
 * Provides transparent preview: contribution, contributor, recipient, product,
 * live price, remaining budget, and required confirmation state.
 */
bitrefillRouter.post('/bitrefill/preview-purchase', async (req: Request, res: Response) => {
  const intent: PurchaseIntent = req.body;
  if (!intent.contributionId || !intent.productId || !intent.packageValue) {
    res.status(400).json({ error: 'Missing required fields: contributionId, productId, packageValue' });
    return;
  }

  // Fetch contribution details
  const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(intent.contributionId) as any;
  if (!contrib) {
    res.status(404).json({ error: `Contribution '${intent.contributionId}' not found.` });
    return;
  }

  // Check live product details
  const liveProduct = await BitrefillService.getLiveProductDetails(intent.productId);
  const pkg = liveProduct?.product.packages.find(p => p.package_value === intent.packageValue);

  const priceUsd = pkg ? parseFloat(pkg.payment_price) : 0.55;
  const dailyCap = parseFloat(process.env.SPEND_CAP_DAILY_USD || '1.00');
  const singleCap = parseFloat(process.env.SPEND_CAP_SINGLE_REWARD_USD || '0.60');
  const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED === 'true';
  const emergencyFreeze = process.env.EMERGENCY_PURCHASE_FREEZE === 'true';

  // Evaluate guardrails
  const validation = BitrefillService.validateGuardrails(intent);

  // Calculate today's spent
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const spentRow = db.prepare(`
    SELECT COALESCE(SUM(price_usd), 0) as s
    FROM rewards
    WHERE created_at >= ? AND is_demo = 0 AND order_status != 'failed'
  `).get(startOfToday.toISOString()) as any;
  const spentToday = spentRow.s;

  res.json({
    contribution: {
      id: contrib.id,
      prNumber: contrib.pr_number,
      prTitle: contrib.pr_title,
      contributor: contrib.contributor,
      verificationStatus: contrib.verification_status,
      evaluationScore: contrib.evaluation_score,
      isDemo: Boolean(contrib.is_demo)
    },
    recipient: {
      contributorUsername: contrib.contributor,
      targetEmail: intent.recipientEmail || null,
      targetPhone: intent.recipientPhone || null
    },
    reward: {
      productId: intent.productId,
      productName: liveProduct?.product.name || intent.productId,
      packageValue: intent.packageValue,
      packageCurrency: pkg?.package_currency || 'INR',
      livePaymentPriceUsd: priceUsd,
      paymentCurrency: 'USD',
      paymentMethod: 'balance',
      inStock: liveProduct?.product.in_stock ?? true,
      isLiveCatalog: liveProduct?.isLive ?? false
    },
    budgetGuardrails: {
      dailySpendCapUsd: dailyCap,
      spentTodayUsd: spentToday,
      remainingDailyBudgetUsd: Math.max(0, dailyCap - spentToday),
      singleRewardCapUsd: singleCap,
      withinSingleCap: priceUsd <= singleCap,
      withinDailyBudget: (spentToday + priceUsd) <= dailyCap,
      emergencyFreezeActive: emergencyFreeze
    },
    approvalPolicy: {
      autoPurchaseEnabled,
      requiresExplicitAdminApproval: !autoPurchaseEnabled || !intent.confirmedByAdmin,
      executionAllowedWithoutAdminConfirmation: false,
      validationResult: validation
    },
    purchaseSafetyNotice: 'NO PURCHASE EXECUTED. This is a read-only preview. Explicit maintainer confirmation is required.'
  });
});

/**
 * POST /api/bitrefill/execute-reward
 * Executes a real or demo reward under strict guardrail controls.
 */
bitrefillRouter.post('/bitrefill/execute-reward', async (req: Request, res: Response) => {
  const intent: PurchaseIntent = req.body;
  if (!intent.contributionId || !intent.productId || !intent.packageValue) {
    res.status(400).json({ error: 'Missing required fields: contributionId, productId, packageValue' });
    return;
  }

  // Strict check: AUTO_PURCHASE_ENABLED=false requires explicit confirmation
  const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED === 'true';
  const hasConfirmation = Boolean(intent.confirmedByAdmin || intent.manualApproval);

  if (!autoPurchaseEnabled && !hasConfirmation) {
    res.status(403).json({
      error: 'EXECUTION_REJECTED: Auto-purchase is disabled. Explicit maintainer confirmation (\'confirmedByAdmin: true\') is required to execute reward fulfillment.'
    });
    return;
  }

  try {
    const result = await BitrefillService.executePurchase(intent);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
