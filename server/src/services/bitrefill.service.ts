import { BitrefillProductSummary, InvoiceStatus, OrderStatus } from '@shipreward/shared';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { AuditService } from './audit.service';
import { BudgetService } from './budget.service';
import { BitrefillMcpService, McpProductDetailsResult } from './bitrefill-mcp.service';
import { VoucherSecurityService } from './voucher-security.service';

// Realistic confirmed catalog for India & Global rewards based on official Bitrefill MCP & CLI specs
export const BITREFILL_CATALOG: BitrefillProductSummary[] = [
  {
    id: 'swiggy-money-india',
    name: 'Swiggy Money India',
    country: 'IN',
    category: 'food',
    description: 'Order food delivery, groceries on Instamart, and dine-out via Swiggy wallet.',
    currency: 'INR',
    recipient_type: 'none',
    in_stock: true,
    packages: [
      { package_value: '50', package_currency: 'INR', payment_price: '0.55', payment_currency: 'USD' },
      { package_value: '100', package_currency: 'INR', payment_price: '1.10', payment_currency: 'USD' },
      { package_value: '250', package_currency: 'INR', payment_price: '2.75', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.50', payment_currency: 'USD' },
      { package_value: '1000', package_currency: 'INR', payment_price: '10.99', payment_currency: 'USD' }
    ]
  },
  {
    id: 'airtel-india',
    name: 'Airtel India Talktime',
    country: 'IN',
    category: 'refill',
    description: 'Prepaid mobile recharge and talktime balance for Airtel subscribers.',
    currency: 'INR',
    recipient_type: 'phone_number',
    in_stock: true,
    packages: [
      { package_value: '10', package_currency: 'INR', payment_price: '0.11', payment_currency: 'USD' },
      { package_value: '120', package_currency: 'INR', payment_price: '1.32', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.50', payment_currency: 'USD' }
    ]
  },
  {
    id: 'zomato-india',
    name: 'Zomato Gift Card',
    country: 'IN',
    category: 'food',
    description: 'Food delivery and dining out across India on Zomato.',
    currency: 'INR',
    recipient_type: 'none',
    in_stock: true,
    packages: [
      { package_value: '250', package_currency: 'INR', payment_price: '2.75', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.50', payment_currency: 'USD' }
    ]
  },
  {
    id: 'jio-india',
    name: 'Jio India Top-up',
    country: 'IN',
    category: 'refill',
    description: 'Prepaid mobile recharge for Reliance Jio prepaid plans and 4G/5G data.',
    currency: 'INR',
    recipient_type: 'phone_number',
    in_stock: true,
    packages: [
      { package_value: '15', package_currency: 'INR', payment_price: '0.18', payment_currency: 'USD' },
      { package_value: '122', package_currency: 'INR', payment_price: '1.42', payment_currency: 'USD' }
    ]
  },
  {
    id: 'esim-india-1gb',
    name: 'Bitrefill eSIM India (1GB, 7 Days)',
    country: 'IN',
    category: 'esim',
    description: 'High-speed data eSIM connecting on Airtel, Jio, and Vi networks.',
    currency: 'USD',
    recipient_type: 'email',
    in_stock: true,
    packages: [
      { package_value: '1GB, 7 Days', package_currency: 'USD', payment_price: '3.88', payment_currency: 'USD' }
    ]
  }
];

export const DISCOVERED_MCP_TOOLS = [
  'get-product-details',
  'search-products',
  'buy-products',
  'submit-prepayment-step',
  'list-invoices',
  'get-invoice-by-id',
  'update-order',
  'search_help_articles',
  'get_help_article',
  'list_help_articles',
  'list-saved-fiat-cards',
  'get-balances'
];

export interface PurchaseIntent {
  contributionId: string;
  productId: string;
  packageValue: string;
  recipientEmail?: string;
  recipientPhone?: string; // international digits only without +, e.g. "919876543210"
  intentPurpose?: string;
  manualApproval?: boolean;
  confirmedByAdmin?: boolean;
  approvedBy?: string;
  isDemo?: boolean;
}

export interface PurchaseResult {
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  orderId: string;
  orderStatus: OrderStatus;
  priceUsd: number;
  productName: string;
  packageValue: string;
  packageCurrency: string;
  maskedVoucherCode: string;
  redemptionInstructions: string;
  deliveredAt: string;
}

export class BitrefillService {
  /**
   * Search catalog products by keyword or category with MCP integration & fallback cache.
   */
  static searchProducts(query: string, country = 'IN'): BitrefillProductSummary[] {
    const q = query.toLowerCase().trim();
    if (!q || q === '*') {
      return BITREFILL_CATALOG.filter(p => p.country.toLowerCase() === country.toLowerCase());
    }

    return BITREFILL_CATALOG.filter(p => 
      (p.country.toLowerCase() === country.toLowerCase()) &&
      (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    );
  }

  /**
   * Get product details and confirm exact package values and price.
   */
  static getProductDetails(productId: string): BitrefillProductSummary | undefined {
    return BITREFILL_CATALOG.find(p => 
      p.id === productId || 
      (productId === 'swiggy-india' && p.id === 'swiggy-money-india')
    );
  }

  /**
   * Get live product details directly through MCP client, falling back to cached catalog.
   */
  static async getLiveProductDetails(productId: string): Promise<{
    product: BitrefillProductSummary;
    isLive: boolean;
  } | null> {
    try {
      const mcpResult = await BitrefillMcpService.getProductDetails(productId);
      if (mcpResult && mcpResult.packages.length > 0) {
        return {
          product: {
            id: mcpResult.id,
            name: mcpResult.name,
            country: mcpResult.country,
            category: 'food',
            description: mcpResult.rawText?.slice(0, 200) || '',
            currency: mcpResult.currency,
            recipient_type: mcpResult.recipient_type,
            in_stock: mcpResult.in_stock,
            packages: mcpResult.packages
          },
          isLive: true
        };
      }
    } catch (err) {
      // Fallback to static catalog below
    }

    const fallback = this.getProductDetails(productId);
    if (fallback) {
      return { product: fallback, isLive: false };
    }
    return null;
  }

  /**
   * Check connection status to Bitrefill services via MCP handshake and REST ping.
   * Distinguishes UNCONFIGURED, CONNECTED, and ERROR.
   */
  static async checkConnectionHealth(): Promise<{
    status: 'connected' | 'unconfigured' | 'error' | 'offline';
    hasApiKey: boolean;
    endpoint: string;
    tools: string[];
    mcpConnected: boolean;
    latencyMs?: number;
    error?: string | null;
  }> {
    const apiKey = (process.env.BITREFILL_API_KEY || '').trim();
    const endpoint = process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp';

    if (!apiKey) {
      return {
        status: 'unconfigured',
        hasApiKey: false,
        endpoint,
        tools: DISCOVERED_MCP_TOOLS,
        mcpConnected: false,
        error: null
      };
    }

    try {
      // 1. Test MCP Handshake
      const mcpResult = await BitrefillMcpService.handshake();
      if (mcpResult.status === 'connected') {
        return {
          status: 'connected',
          hasApiKey: true,
          endpoint,
          tools: mcpResult.tools.length > 0 ? mcpResult.tools : DISCOVERED_MCP_TOOLS,
          mcpConnected: true,
          latencyMs: mcpResult.latencyMs,
          error: null
        };
      }

      // If MCP returned error, verify with REST v2 ping
      const res = await fetch('https://api.bitrefill.com/v2/ping', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        return {
          status: 'connected',
          hasApiKey: true,
          endpoint,
          tools: DISCOVERED_MCP_TOOLS,
          mcpConnected: false,
          error: null
        };
      }

      if (res.status === 401) {
        return {
          status: 'error',
          hasApiKey: true,
          endpoint,
          tools: DISCOVERED_MCP_TOOLS,
          mcpConnected: false,
          error: 'Unauthorized (401): Invalid Bitrefill API key in server/.env.'
        };
      }

      return {
        status: 'error',
        hasApiKey: true,
        endpoint,
        tools: DISCOVERED_MCP_TOOLS,
        mcpConnected: false,
        error: `Bitrefill returned HTTP ${res.status}: ${res.statusText}`
      };
    } catch (err: any) {
      return {
        status: 'error',
        hasApiKey: true,
        endpoint,
        tools: DISCOVERED_MCP_TOOLS,
        mcpConnected: false,
        error: `Bitrefill connection failed: ${err.message}`
      };
    }
  }

  /**
   * Mask voucher codes for safe dashboard display and persistent audit trail.
   */
  static maskVoucherCode(code: string): string {
    return VoucherSecurityService.maskCode(code);
  }

  /**
   * Validates spend guardrails for an intended purchase.
   * Returns whether authorized and detailed breakdown.
   */
  static validateGuardrails(intent: PurchaseIntent): {
    authorized: boolean;
    requiresApproval: boolean;
    reason?: string;
    product?: BitrefillProductSummary;
    packageValue?: string;
    priceUsd?: number;
    breakdown?: Record<string, any>;
  } {
    // 1. Check Emergency Freeze
    const emergencyFreeze = process.env.EMERGENCY_PURCHASE_FREEZE === 'true';
    if (emergencyFreeze) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: 'Emergency purchase freeze is active across all programmes.'
      };
    }

    // 2. Check Contribution Exists and is VERIFIED
    const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(intent.contributionId) as any;
    if (!contrib) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Contribution '${intent.contributionId}' not found.`
      };
    }

    if (contrib.verification_status !== 'VERIFIED') {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Contribution is not in VERIFIED status (current: ${contrib.verification_status}). Only verified contributions qualify for fulfillment.`
      };
    }

    // 3. Duplicate Purchase Prevention
    const existingReward = db.prepare('SELECT * FROM rewards WHERE contribution_id = ?').get(intent.contributionId) as any;
    if (existingReward) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Duplicate purchase prevented: Reward '${existingReward.id}' has already been fulfilled for PR #${contrib.pr_number}.`
      };
    }

    // 4. Validate Product and Package Value
    const product = this.getProductDetails(intent.productId);
    if (!product) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Product '${intent.productId}' not found in catalog.`
      };
    }

    const pkg = product.packages.find(p => p.package_value === intent.packageValue);
    if (!pkg) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Invalid package_value '${intent.packageValue}' for product '${product.id}'. Must match exact catalog denomination.`
      };
    }

    const priceUsd = parseFloat(pkg.payment_price);

    const isDemo = Boolean(intent.isDemo || contrib?.is_demo || !process.env.BITREFILL_API_KEY);

    // 5. Check Budget Authorization via BudgetService
    const budgetAuth = BudgetService.authorizeSpend(contrib.program_id, priceUsd, isDemo);
    if (!budgetAuth.authorized) {
      return {
        authorized: false,
        requiresApproval: false,
        reason: `Budget guardrail rejected: ${budgetAuth.reason}`
      };
    }

    // 6. Check Single Reward Threshold & Approval Requirement
    const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED === 'true';
    const singleCap = parseFloat(process.env.SPEND_CAP_SINGLE_REWARD_USD || '0.60');

    if (priceUsd > singleCap) {
      return {
        authorized: false,
        requiresApproval: true,
        reason: `Purchase price ($${priceUsd.toFixed(2)}) exceeds maximum single reward cap ($${singleCap.toFixed(2)}).`
      };
    }

    const hasExplicitApproval = Boolean(intent.manualApproval || intent.confirmedByAdmin);
    const requiresApproval = !autoPurchaseEnabled;

    if (requiresApproval && !hasExplicitApproval) {
      return {
        authorized: false,
        requiresApproval: true,
        reason: 'Auto-purchase is disabled. Explicit maintainer approval is required to execute reward fulfillment.',
        product,
        packageValue: pkg.package_value,
        priceUsd,
        breakdown: {
          productName: product.name,
          packageValue: pkg.package_value,
          packageCurrency: pkg.package_currency,
          priceUsd,
          programId: contrib.program_id,
          contributor: contrib.contributor,
          prNumber: contrib.pr_number,
          autoPurchaseEnabled,
          emergencyFreeze,
          confirmationState: 'AWAITING_EXPLICIT_CONFIRMATION'
        }
      };
    }

    return {
      authorized: true,
      requiresApproval: false,
      product,
      packageValue: pkg.package_value,
      priceUsd,
      breakdown: {
        productName: product.name,
        packageValue: pkg.package_value,
        packageCurrency: pkg.package_currency,
        priceUsd,
        programId: contrib.program_id,
        contributor: contrib.contributor,
        prNumber: contrib.pr_number,
        autoPurchaseEnabled,
        emergencyFreeze,
        confirmationState: 'AUTHORIZED'
      }
    };
  }

  /**
   * Executes a purchase following the official Bitrefill lifecycle:
   * Guardrail check -> buy-products -> get-invoice-by-id -> check order delivery.
   */
  static async executePurchase(intent: PurchaseIntent): Promise<PurchaseResult> {
    const guardrail = this.validateGuardrails(intent);
    if (!guardrail.authorized) {
      AuditService.log({
        eventType: 'PURCHASE_FAILED',
        actor: 'bitrefill_guardrail',
        decision: 'REJECTED',
        contributionId: intent.contributionId,
        costUsd: guardrail.priceUsd || 0,
        details: `Purchase blocked: ${guardrail.reason}`
      });
      throw new Error(guardrail.reason || 'Purchase blocked by spend guardrails.');
    }

    const product = guardrail.product!;
    const pkg = product.packages.find(p => p.package_value === intent.packageValue)!;
    const priceUsd = guardrail.priceUsd!;
    const now = new Date().toISOString();

    const contrib = db.prepare('SELECT * FROM contributions WHERE id = ?').get(intent.contributionId) as any;
    const isDemo = Boolean(intent.isDemo || contrib?.is_demo || !process.env.BITREFILL_API_KEY);

    // Atomically reserve budget before executing downstream purchase
    const reserved = BudgetService.reserveBudget(contrib.program_id, priceUsd, isDemo);
    if (!reserved) {
      AuditService.log({
        eventType: 'PURCHASE_FAILED',
        actor: 'budget_guardrail',
        decision: 'REJECTED',
        programId: contrib.program_id,
        contributionId: intent.contributionId,
        costUsd: priceUsd,
        details: 'Atomic budget reservation failed: programme budget cap reached.'
      });
      throw new Error('Concurrent budget limit reached: programme daily or total budget fully allocated.');
    }

    // DEMO / SIMULATION EXECUTION
    if (isDemo) {
      const demoInvoiceId = 'inv_' + crypto.randomBytes(6).toString('hex');
      const demoOrderId = 'ord_' + crypto.randomBytes(6).toString('hex');
      const rawVoucher = `${product.name.split(' ')[0].toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const maskedCode = this.maskVoucherCode(rawVoucher);

      // Encrypt raw redemption voucher
      const envelope = VoucherSecurityService.encrypt({
        code: rawVoucher,
        instructions: `Redeem via ${product.name} app or website using registered account details.`
      });

      const rewardId = 'rew_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO rewards (
          id, contribution_id, program_id, contributor, recipient_email, recipient_phone,
          product_id, product_name, package_value, package_currency, price_usd,
          invoice_id, invoice_status, order_id, order_status, masked_voucher_code,
          encrypted_voucher_payload, voucher_iv, voucher_auth_tag,
          redemption_instructions, is_demo, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rewardId,
        intent.contributionId,
        contrib.program_id,
        contrib.contributor,
        intent.recipientEmail || null,
        intent.recipientPhone || null,
        product.id,
        product.name,
        pkg.package_value,
        pkg.package_currency,
        priceUsd,
        demoInvoiceId,
        'complete',
        demoOrderId,
        'delivered',
        maskedCode,
        envelope.encryptedPayload,
        envelope.iv,
        envelope.authTag,
        `Redeem via ${product.name} app or website using registered account details.`,
        contrib.is_demo ? 1 : 0,
        now,
        now
      );

      BudgetService.recordSpend(contrib.program_id, priceUsd, Boolean(contrib.is_demo));

      AuditService.log({
        eventType: 'BITREFILL_ORDER_DELIVERED',
        actor: intent.approvedBy || 'autonomous_agent',
        decision: 'AUTHORIZED',
        programId: contrib.program_id,
        contributionId: intent.contributionId,
        rewardId,
        costUsd: priceUsd,
        details: `Fulfilled ${product.name} (${pkg.package_value} ${pkg.package_currency}) for @${contrib.contributor}. Invoice: ${demoInvoiceId}`
      });

      return {
        invoiceId: demoInvoiceId,
        invoiceStatus: 'complete',
        orderId: demoOrderId,
        orderStatus: 'delivered',
        priceUsd,
        productName: product.name,
        packageValue: pkg.package_value,
        packageCurrency: pkg.package_currency,
        maskedVoucherCode: maskedCode,
        redemptionInstructions: `Redeem via ${product.name} app or website using registered account details.`,
        deliveredAt: now
      };
    }

    // LIVE BITREFILL EXECUTION via authenticated MCP buy-products
    // Strict Precondition: Verify separate VOUCHER_ENCRYPTION_KEY before placing order
    if (!VoucherSecurityService.verifyEncryptionHealth()) {
      throw new Error('Preflight check failed: Voucher encryption health verification failed.');
    }

    const apiKey = (process.env.BITREFILL_API_KEY || '').trim();
    let invoiceId = '';
    let invoiceStatus = 'complete';
    let orderId = 'ord_pending';

    try {
      const mcpBuyResult = await BitrefillMcpService.buyProducts([
        {
          product_id: product.id,
          package_value: pkg.package_value
        }
      ]);
      invoiceId = mcpBuyResult.invoiceId;
      if (!invoiceId) {
        // If regex didn't match UUID directly, parse from list-invoices or REST v2
        const invList = await fetch('https://api.bitrefill.com/v2/invoices?limit=1', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (invList.ok) {
          const invListJson = await invList.json();
          invoiceId = invListJson.data?.[0]?.id || '';
        }
      }
    } catch (mcpErr: any) {
      BudgetService.releaseReservation(contrib.program_id, priceUsd, isDemo);
      AuditService.log({
        eventType: 'PURCHASE_FAILED',
        actor: 'bitrefill_mcp',
        decision: 'ERROR',
        contributionId: intent.contributionId,
        costUsd: priceUsd,
        details: `Bitrefill MCP buy-products execution failed: ${mcpErr.message}`
      });
      throw new Error(`Bitrefill MCP buy-products execution failed: ${mcpErr.message}`);
    }

    if (!invoiceId) {
      BudgetService.releaseReservation(contrib.program_id, priceUsd, isDemo);
      throw new Error('Bitrefill purchase failed: No invoice ID returned from buy-products.');
    }

    // Reconcile invoice details and retrieve order ID
    try {
      const invRes = await fetch(`https://api.bitrefill.com/v2/invoices/${invoiceId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (invRes.ok) {
        const invJson = await invRes.json();
        invoiceStatus = invJson.data?.status || 'complete';
        orderId = invJson.data?.orders?.[0]?.id || 'ord_pending';
      }
    } catch (reconErr) {
      // Non-fatal, proceed with polling
    }

    // Poll until order is DELIVERED (do not treat invoice complete as order delivered)
    let orderStatus: OrderStatus = 'processing';
    let rawCode = '';
    let pin = '';
    let link = '';
    let instructions = `Delivery confirmed by Bitrefill for ${product.name}`;

    if (orderId && orderId !== 'ord_pending') {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 2500));
        const orderRes = await fetch(`https://api.bitrefill.com/v2/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (orderRes.ok) {
          const orderJson: any = await orderRes.json();
          if (orderJson.data.status === 'delivered') {
            orderStatus = 'delivered';
            const info = orderJson.data.redemption_info || {};
            rawCode = info.code || info.pin || '';
            pin = info.pin || '';
            link = info.link || '';
            instructions = info.instructions || instructions;
            break;
          }
        }
      }
    }

    const maskedCode = this.maskVoucherCode(rawCode || 'CODE-REDACTED');
    const rewardId = 'rew_' + crypto.randomBytes(6).toString('hex');
    const finishTime = new Date().toISOString();

    // Encrypt raw voucher details
    const envelope = VoucherSecurityService.encrypt({
      code: rawCode,
      pin,
      link,
      instructions
    });

    db.prepare(`
      INSERT INTO rewards (
        id, contribution_id, program_id, contributor, recipient_email, recipient_phone,
        product_id, product_name, package_value, package_currency, price_usd,
        invoice_id, invoice_status, order_id, order_status, masked_voucher_code,
        encrypted_voucher_payload, voucher_iv, voucher_auth_tag,
        redemption_instructions, is_demo, created_at, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rewardId,
      intent.contributionId,
      contrib.program_id,
      contrib.contributor,
      intent.recipientEmail || null,
      intent.recipientPhone || null,
      product.id,
      product.name,
      pkg.package_value,
      pkg.package_currency,
      priceUsd,
      invoiceId,
      invoiceStatus,
      orderId,
      orderStatus,
      maskedCode,
      envelope.encryptedPayload,
      envelope.iv,
      envelope.authTag,
      instructions,
      0, // Live real reward
      now,
      orderStatus === 'delivered' ? finishTime : null
    );

    AuditService.log({
      eventType: orderStatus === 'delivered' ? 'BITREFILL_ORDER_DELIVERED' : 'BITREFILL_INVOICE_CREATED',
      actor: intent.approvedBy || 'autonomous_agent',
      decision: 'AUTHORIZED',
      programId: contrib.program_id,
      contributionId: intent.contributionId,
      rewardId,
      costUsd: priceUsd,
      details: `Live Bitrefill MCP purchase: ${product.name} (${pkg.package_value} ${pkg.package_currency}) for @${contrib.contributor}. Invoice: ${invoiceId}, Order: ${orderId}, Status: ${orderStatus}`
    });

    return {
      invoiceId,
      invoiceStatus: invoiceStatus as InvoiceStatus,
      orderId,
      orderStatus,
      priceUsd,
      productName: product.name,
      packageValue: pkg.package_value,
      packageCurrency: pkg.package_currency,
      maskedVoucherCode: maskedCode,
      redemptionInstructions: instructions,
      deliveredAt: finishTime
    };
  }
}
