import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BitrefillProductSummary, BitrefillPackage } from '@shipreward/shared';

export interface McpBalanceInfo {
  currency: string;
  amount: number;
  paymentMethod: string;
}

export interface McpProductDetailsResult {
  id: string;
  name: string;
  country: string;
  currency: string;
  recipient_type: 'none' | 'phone_number' | 'email' | 'account' | 'username';
  in_stock: boolean;
  packages: BitrefillPackage[];
  isLive: boolean;
  rawText?: string;
}

export class BitrefillMcpService {
  private static client: Client | null = null;
  private static transport: StreamableHTTPClientTransport | null = null;
  private static cachedTools: string[] = [];
  private static lastHandshake: number = 0;
  private static productCache: Map<string, { data: McpProductDetailsResult; timestamp: number }> = new Map();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Initialize or retrieve an active authenticated MCP Client.
   */
  public static async getClient(): Promise<Client | null> {
    const apiKey = (process.env.BITREFILL_API_KEY || '').trim();
    if (!apiKey) {
      return null;
    }

    const endpoint = process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp';

    if (this.client && Date.now() - this.lastHandshake < this.CACHE_TTL_MS) {
      return this.client;
    }

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(endpoint),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${apiKey}`
            }
          }
        }
      );

      const client = new Client(
        { name: 'shipreward-mcp-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      this.client = client;
      this.transport = transport;
      this.lastHandshake = Date.now();
      return this.client;
    } catch (err: any) {
      this.client = null;
      this.transport = null;
      throw new Error(`MCP Client Connection failed: ${err.message}`);
    }
  }

  /**
   * Performs an official MCP Handshake and lists all discovered tools.
   */
  public static async handshake(): Promise<{
    status: 'connected' | 'unconfigured' | 'error';
    endpoint: string;
    tools: string[];
    hasApiKey: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const apiKey = (process.env.BITREFILL_API_KEY || '').trim();
    const endpoint = process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp';

    if (!apiKey) {
      return {
        status: 'unconfigured',
        endpoint,
        tools: [],
        hasApiKey: false,
        latencyMs: 0
      };
    }

    const start = Date.now();
    try {
      const client = await this.getClient();
      if (!client) {
        return {
          status: 'unconfigured',
          endpoint,
          tools: [],
          hasApiKey: false,
          latencyMs: Date.now() - start
        };
      }

      const listResult = await client.listTools();
      const toolNames = listResult.tools.map(t => t.name);
      this.cachedTools = toolNames;

      return {
        status: 'connected',
        endpoint,
        tools: toolNames,
        hasApiKey: true,
        latencyMs: Date.now() - start
      };
    } catch (err: any) {
      return {
        status: 'error',
        endpoint,
        tools: this.cachedTools,
        hasApiKey: true,
        latencyMs: Date.now() - start,
        error: err.message
      };
    }
  }

  /**
   * Calls MCP 'get-balances' to inspect real spendable balance on the account.
   */
  public static async getAccountBalances(): Promise<McpBalanceInfo[]> {
    const client = await this.getClient();
    if (!client) return [];

    try {
      const result: any = await client.callTool({
        name: 'get-balances',
        arguments: {}
      });

      const text = result?.content?.[0]?.text || '';
      const balances: McpBalanceInfo[] = [];

      // Parse text representation of balances
      // e.g.:
      // - payment_method: balance
      //   balance_currency: USD
      //   amount: "25.00"
      const blocks = text.split('- payment_method:');
      for (const block of blocks) {
        if (!block.trim()) continue;
        const currMatch = block.match(/balance_currency:\s*([A-Za-z0-9_]+)/);
        const amountMatch = block.match(/amount:\s*"?([0-9.]+)"?/);
        const methodMatch = block.match(/^\s*([A-Za-z0-9_]+)/);

        if (currMatch && amountMatch) {
          balances.push({
            paymentMethod: methodMatch ? methodMatch[1] : 'balance',
            currency: currMatch[1],
            amount: parseFloat(amountMatch[1])
          });
        }
      }

      return balances;
    } catch (err) {
      return [];
    }
  }

  /**
   * Calls MCP 'get-product-details' with live denomination packages and prices.
   */
  public static async getProductDetails(productId: string): Promise<McpProductDetailsResult | null> {
    const cached = this.productCache.get(productId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const client = await this.getClient();
    if (!client) {
      return null;
    }

    try {
      const result: any = await client.callTool({
        name: 'get-product-details',
        arguments: { product_id: productId }
      });

      const text = result?.content?.[0]?.text || '';
      const parsed = this.parseProductDetailsText(text, productId);
      if (parsed) {
        this.productCache.set(productId, { data: parsed, timestamp: Date.now() });
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  /**
   * Calls MCP 'search-products' tool with required intent parameter.
   */
  public static async searchProducts(query: string, country = 'IN', intent = 'SHIPREWARD Hackathon Verification'): Promise<any[]> {
    const client = await this.getClient();
    if (!client) return [];

    try {
      const result: any = await client.callTool({
        name: 'search-products',
        arguments: {
          intent,
          country,
          query: query || undefined
        }
      });

      const text = result?.content?.[0]?.text || '';
      return this.parseSearchResultsText(text);
    } catch (err) {
      return [];
    }
  }

  /**
   * Calls MCP 'buy-products' tool with exact required parameters.
   */
  public static async buyProducts(cartItems: Array<{ product_id: string; package_value: string; refill_input?: string }>): Promise<{
    invoiceId: string;
    invoiceAccessToken?: string;
    rawText: string;
  }> {
    const client = await this.getClient();
    if (!client) throw new Error('MCP client not connected.');

    const result: any = await client.callTool({
      name: 'buy-products',
      arguments: {
        cart_items: cartItems,
        payment_method: 'balance',
        balance_currency: 'USD'
      }
    });

    const text = result?.content?.[0]?.text || '';
    
    // Parse invoice_id
    const idMatch = text.match(/invoice_id:\s*([a-zA-Z0-9_-]+)/i) ||
                    text.match(/id:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i) ||
                    text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const tokenMatch = text.match(/invoice_access_token:\s*([a-zA-Z0-9_-]+)/i);

    return {
      invoiceId: idMatch ? idMatch[1] : '',
      invoiceAccessToken: tokenMatch ? tokenMatch[1] : undefined,
      rawText: text
    };
  }

  /**
   * Calls MCP 'get-invoice-by-id' tool to inspect invoice and order status.
   */
  public static async getInvoiceById(invoiceId: string, invoiceAccessToken?: string): Promise<string> {
    const client = await this.getClient();
    if (!client) throw new Error('MCP client not connected.');

    const result: any = await client.callTool({
      name: 'get-invoice-by-id',
      arguments: {
        invoice_id: invoiceId,
        invoice_access_token: invoiceAccessToken || undefined
      }
    });

    return result?.content?.[0]?.text || '';
  }

  /**
   * Robust parser for MCP product details text response format.
   */
  private static parseProductDetailsText(text: string, fallbackId: string): McpProductDetailsResult | null {
    if (!text) return null;

    const idMatch = text.match(/id:\s*([^\n\r]+)/);
    const nameMatch = text.match(/name:\s*([^\n\r]+)/);
    const countryMatch = text.match(/country_code:\s*([^\n\r]+)/);
    const currencyMatch = text.match(/currency:\s*([^\n\r]+)/);
    const recipientMatch = text.match(/recipient_type:\s*([^\n\r]+)/);
    const inStockMatch = text.match(/in_stock:\s*(true|false)/i);

    const id = idMatch ? idMatch[1].trim() : fallbackId;
    const name = nameMatch ? nameMatch[1].trim() : id;
    const country = countryMatch ? countryMatch[1].trim() : 'IN';
    const currency = currencyMatch ? currencyMatch[1].trim() : 'INR';
    const recipient_type = (recipientMatch ? recipientMatch[1].trim() : 'none') as any;
    const in_stock = inStockMatch ? inStockMatch[1].toLowerCase() === 'true' : true;

    // Parse packages table:
    // packages[8]{package_value,package_currency,payment_price,payment_currency}:
    //   "10000",INR,"109.99",USD
    //   "50",INR,"0.55",USD
    const packages: BitrefillPackage[] = [];
    const lines = text.split('\n');
    let inPackages = false;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r/g, '');
      if (line.includes('packages[')) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (!line.startsWith('  ')) {
          inPackages = false;
          continue;
        }
        const clean = line.trim();
        const parts = clean.split(',').map(s => s.replace(/["']/g, '').trim());
        if (parts.length >= 4) {
          packages.push({
            package_value: parts[0],
            package_currency: parts[1],
            payment_price: parts[2],
            payment_currency: parts[3]
          });
        }
      }
    }

    return {
      id,
      name,
      country,
      currency,
      recipient_type,
      in_stock,
      packages,
      isLive: true,
      rawText: text
    };
  }

  /**
   * Robust parser for MCP search products text response format.
   */
  private static parseSearchResultsText(text: string): any[] {
    const products: any[] = [];
    const lines = text.split('\n');
    let currentProduct: any = null;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r/g, '');
      if (line.trim().startsWith('- _id:')) {
        if (currentProduct) products.push(currentProduct);
        currentProduct = { id: line.replace('- _id:', '').trim() };
      } else if (currentProduct) {
        if (line.includes('name:')) {
          currentProduct.name = line.split('name:')[1]?.trim() || '';
        } else if (line.includes('currency:')) {
          currentProduct.currency = line.split('currency:')[1]?.trim() || '';
        } else if (line.includes('in_stock:')) {
          currentProduct.in_stock = line.includes('true');
        }
      }
    }
    if (currentProduct) products.push(currentProduct);
    return products;
  }
}
