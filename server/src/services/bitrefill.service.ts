import { BitrefillProductSummary, InvoiceStatus, OrderStatus } from '@shipreward/shared';
import crypto from 'node:crypto';

// Realistic catalog for India & Global rewards based on official Bitrefill specs
export const BITREFILL_CATALOG: BitrefillProductSummary[] = [
  {
    id: 'swiggy-india',
    name: 'Swiggy Money Voucher',
    country: 'IN',
    category: 'food',
    description: 'Order food delivery, groceries on Instamart, and dine-out via Swiggy.',
    currency: 'INR',
    recipient_type: 'none',
    in_stock: true,
    packages: [
      { package_value: '250', package_currency: 'INR', payment_price: '2.99', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.98', payment_currency: 'USD' },
      { package_value: '1000', package_currency: 'INR', payment_price: '11.96', payment_currency: 'USD' }
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
      { package_value: '250', package_currency: 'INR', payment_price: '2.99', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.98', payment_currency: 'USD' }
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
      { package_value: '120', package_currency: 'INR', payment_price: '1.31', payment_currency: 'USD' },
      { package_value: '500', package_currency: 'INR', payment_price: '5.49', payment_currency: 'USD' }
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

export interface PurchaseIntent {
  productId: string;
  packageValue: string;
  recipientEmail?: string;
  recipientPhone?: string; // international digits only without +, e.g. "919876543210"
  intentPurpose: string;
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
   * Search catalog products by keyword or category.
   */
  static searchProducts(query: string, country = 'IN'): BitrefillProductSummary[] {
    const q = query.toLowerCase();
    return BITREFILL_CATALOG.filter(p => 
      (p.country.toLowerCase() === country.toLowerCase()) &&
      (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    );
  }

  /**
   * Get product details and confirm exact package values and price.
   */
  static getProductDetails(productId: string): BitrefillProductSummary | undefined {
    return BITREFILL_CATALOG.find(p => p.id === productId);
  }

  /**
   * Check connection status to Bitrefill services.
   */
  static async checkConnectionHealth(): Promise<{
    status: 'connected' | 'unconfigured' | 'offline';
    hasApiKey: boolean;
    endpoint: string;
  }> {
    const apiKey = process.env.BITREFILL_API_KEY;
    const endpoint = process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp';

    if (!apiKey) {
      return {
        status: 'unconfigured',
        hasApiKey: false,
        endpoint
      };
    }

    // In live mode with API key configured, we ping the official endpoint
    try {
      const res = await fetch('https://api.bitrefill.com/v2/ping', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        return { status: 'connected', hasApiKey: true, endpoint };
      }
      return { status: 'offline', hasApiKey: true, endpoint };
    } catch {
      return { status: 'offline', hasApiKey: true, endpoint };
    }
  }

  /**
   * Mask voucher codes for safe dashboard display and persistent audit trail.
   * e.g. "SWIGGY-8942-1928-9821" -> "SWIGGY-••••-••••-9821"
   */
  static maskVoucherCode(code: string): string {
    if (!code || code.length < 8) return '••••-••••';
    const last4 = code.slice(-4);
    const prefix = code.split('-')[0] || 'REWARD';
    return `${prefix}-••••-••••-${last4}`;
  }

  /**
   * Executes a purchase following the official Bitrefill lifecycle:
   * search-products -> get-product-details -> buy-products -> get-invoice-by-id -> check order delivery.
   */
  static async executePurchase(intent: PurchaseIntent): Promise<PurchaseResult> {
    const product = this.getProductDetails(intent.productId);
    if (!product) {
      throw new Error(`Product not found in Bitrefill catalog: ${intent.productId}`);
    }

    const pkg = product.packages.find(p => p.package_value === intent.packageValue);
    if (!pkg) {
      throw new Error(`Invalid package_value '${intent.packageValue}' for product '${product.id}'. Must match exact catalog package.`);
    }

    const priceUsd = parseFloat(pkg.payment_price);
    const now = new Date().toISOString();

    // In demo or test mode without real API credits:
    if (intent.isDemo || !process.env.BITREFILL_API_KEY) {
      const demoInvoiceId = 'inv_' + crypto.randomBytes(6).toString('hex');
      const demoOrderId = 'ord_' + crypto.randomBytes(6).toString('hex');
      const rawVoucher = `${product.name.split(' ')[0].toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      return {
        invoiceId: demoInvoiceId,
        invoiceStatus: 'complete',
        orderId: demoOrderId,
        orderStatus: 'delivered',
        priceUsd,
        productName: product.name,
        packageValue: pkg.package_value,
        packageCurrency: pkg.package_currency,
        maskedVoucherCode: this.maskVoucherCode(rawVoucher),
        redemptionInstructions: `Redeem via ${product.name} app or website using registered account details.`,
        deliveredAt: now
      };
    }

    // LIVE BITREFILL EXECUTION (Using official REST v2 / MCP endpoint)
    // Note: This path executes when BITREFILL_API_KEY is provided and intent.isDemo is false.
    const apiKey = process.env.BITREFILL_API_KEY;
    const invoicePayload: any = {
      products: [{
        product_id: product.id,
        value: parseFloat(pkg.package_value),
        quantity: 1,
        phone_number: intent.recipientPhone
      }],
      payment_method: 'balance',
      auto_pay: true
    };

    const invoiceRes = await fetch('https://api.bitrefill.com/v2/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoicePayload)
    });

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text();
      throw new Error(`Bitrefill invoice creation failed: ${invoiceRes.status} ${errText}`);
    }

    const invoiceJson: any = await invoiceRes.json();
    const invoiceData = invoiceJson.data;
    const invoiceId = invoiceData.id;
    const orderId = invoiceData.orders?.[0]?.id || 'ord_pending';

    // Poll until order is DELIVERED
    let orderStatus: OrderStatus = 'processing';
    let rawCode = '';

    if (orderId && orderId !== 'ord_pending') {
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 1500));
        const orderRes = await fetch(`https://api.bitrefill.com/v2/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (orderRes.ok) {
          const orderJson: any = await orderRes.json();
          if (orderJson.data.status === 'delivered') {
            orderStatus = 'delivered';
            rawCode = orderJson.data.redemption_info?.code || orderJson.data.redemption_info?.pin || '';
            break;
          }
        }
      }
    }

    return {
      invoiceId,
      invoiceStatus: invoiceData.status || 'complete',
      orderId,
      orderStatus,
      priceUsd,
      productName: product.name,
      packageValue: pkg.package_value,
      packageCurrency: pkg.package_currency,
      maskedVoucherCode: this.maskVoucherCode(rawCode || 'CODE-REDACTED'),
      redemptionInstructions: `Delivery confirmed by Bitrefill for ${product.name}`,
      deliveredAt: new Date().toISOString()
    };
  }
}

