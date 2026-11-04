import React, { useState } from 'react';
import { 
  BitrefillProductSummary, 
  SystemHealth, 
  RewardRecord, 
  Contribution 
} from '@shipreward/shared';
import { 
  ShoppingBag, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Lock, 
  RefreshCw, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { toggleEmergencyFreeze, executeReward } from '../services/api';

interface CommerceViewProps {
  products: BitrefillProductSummary[];
  health?: SystemHealth;
  rewards?: RewardRecord[];
  contributions?: Contribution[];
  onRefresh?: () => void;
}

export const CommerceView: React.FC<CommerceViewProps> = ({ 
  products, 
  health, 
  rewards = [], 
  contributions = [],
  onRefresh 
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'approvals' | 'history'>('catalog');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isTogglingFreeze, setIsTogglingFreeze] = useState(false);
  const [selectedContributionId, setSelectedContributionId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('swiggy-money-india');
  const [selectedPackageValue, setSelectedPackageValue] = useState<string>('50');
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [fulfillmentMessage, setFulfillmentMessage] = useState<string | null>(null);

  // Status mapping
  const bitrefillStatus = health?.bitrefill?.status || 'unconfigured';
  const isConnected = bitrefillStatus === 'connected';
  const isError = bitrefillStatus === 'error';
  const isUnconfigured = bitrefillStatus === 'unconfigured';
  const isFrozen = health?.bitrefill?.emergencyFreeze || false;

  // Discovered tools list
  const discoveredTools = [
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

  // Pending verified contributions without rewards
  const rewardedContribIds = new Set(rewards.map(r => r.contributionId));
  const pendingFulfillments = contributions.filter(c => 
    c.verificationStatus === 'VERIFIED' && !rewardedContribIds.has(c.id)
  );

  const filteredProducts = products.filter(p => {
    if (selectedCategory !== 'ALL' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true);
    try {
      await toggleEmergencyFreeze(!isFrozen);
      onRefresh?.();
    } catch (err: any) {
      alert(`Error toggling emergency freeze: ${err.message}`);
    } finally {
      setIsTogglingFreeze(false);
    }
  };

  const handleExecuteFulfillment = async (contribId: string) => {
    setIsFulfilling(true);
    setFulfillmentMessage(null);
    try {
      const res = await executeReward({
        contributionId: contribId,
        productId: selectedProductId,
        packageValue: selectedPackageValue,
        manualApproval: true,
        approvedBy: 'Lead Maintainer'
      });
      setFulfillmentMessage(`Fulfillment success! Invoice ID: ${res.invoiceId}, Order: ${res.orderId}, Status: ${res.orderStatus}`);
      onRefresh?.();
    } catch (err: any) {
      setFulfillmentMessage(`Guardrail error: ${err.message}`);
    } finally {
      setIsFulfilling(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col min-h-0">
        
        {/* Header & Connection Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500">BITREFILL ECOMMERCE MCP</span>
              {isConnected && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  CONNECTED (AUTHENTICATED)
                </span>
              )}
              {isUnconfigured && (
                <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/60 text-amber-300 font-mono text-[10px] font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  ZERO-BALANCE / UNCONFIGURED
                </span>
              )}
              {isError && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/60 text-rose-300 font-mono text-[10px] font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                  ERROR (UNAUTHORIZED / BAD CREDENTIALS)
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-100 mt-1">
              Autonomous Commerce & Micro-Reward Fulfillment
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Finding, pricing and fulfilling real digital products (gift cards, mobile top-ups, eSIMs) via Bitrefill MCP tools.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleFreeze}
              disabled={isTogglingFreeze}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                isFrozen 
                  ? 'bg-rose-950/80 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse'
                  : 'bg-[#181B24] border-[#2A2E3B] text-slate-300 hover:border-rose-500/60'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>{isFrozen ? 'EMERGENCY FREEZE ACTIVE' : 'Arm Emergency Freeze'}</span>
            </button>

            <button
              onClick={onRefresh}
              className="bg-[#181B24] hover:bg-[#202430] border border-[#2A2E3B] p-2 rounded-xl text-slate-300 cursor-pointer"
              title="Refresh MCP Status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Discovered MCP Tools Ribbon */}
        <div className="bg-[#12141A] border border-[#1E222D] rounded-xl px-3.5 py-2 my-3 flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 font-semibold uppercase text-[10px]">MCP Tools Discovered:</span>
          {discoveredTools.map(t => (
            <span key={t} className="px-2 py-0.5 rounded bg-[#181B24] border border-[#262B37] text-slate-300 text-[10px]">
              {t}
            </span>
          ))}
          <span className="text-slate-500 text-[10px] ml-auto">Endpoint: {health?.bitrefill?.endpoint || 'https://api.bitrefill.com/mcp'}</span>
        </div>

        {/* Spend Guardrails Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Single Reward Cap</div>
            <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">$0.60 USD</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Strict demo cap (Swiggy ₹50 = $0.55)</div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Daily Hard Spend Cap</div>
            <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">
              ${(health?.bitrefill?.spentTodayUsd || 0).toFixed(2)}
              <span className="text-xs text-slate-400 font-normal"> / ${(health?.bitrefill?.dailySpendCapUsd || 1.00).toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              ${(health?.bitrefill?.remainingTodayUsd || 1.00).toFixed(2)} remaining today
            </div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Pending Fulfillments</div>
            <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">{pendingFulfillments.length}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Verified contributions eligible</div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Payment Method</div>
            <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">Account Balance</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Event Credits / Crypto fallback</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#1A1D24] pb-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeTab === 'catalog' 
                ? 'bg-[#1E222D] text-slate-100 font-bold border border-[#2B303E]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Product Catalogue ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === 'approvals' 
                ? 'bg-[#1E222D] text-slate-100 font-bold border border-[#2B303E]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Pending Approvals</span>
            {pendingFulfillments.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                {pendingFulfillments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeTab === 'history' 
                ? 'bg-[#1E222D] text-slate-100 font-bold border border-[#2B303E]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fulfillment History ({rewards.length})
          </button>
        </div>

        {/* TAB 1: PRODUCT CATALOGUE */}
        {activeTab === 'catalog' && (
          <div className="flex-1 flex flex-col min-h-0 mt-3">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search products by brand, category (food, refill, esim), or country code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#13151C] border border-[#20242F] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                {['ALL', 'food', 'refill', 'esim'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                      selectedCategory === cat 
                        ? 'bg-[#1F232E] border-slate-600 text-slate-200 font-semibold' 
                        : 'bg-[#13151C] border-[#20242F] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto flex-1 pr-1">
              {filteredProducts.map((p) => (
                <div key={p.id} className="bg-[#13151D] border border-[#202430] p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">{p.category}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                        {p.country}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">{p.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</p>

                    <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                      <span className="text-slate-500">Recipient:</span>
                      <span className="text-slate-300 font-semibold">{p.recipient_type}</span>
                    </div>

                    {/* Packages */}
                    <div className="mt-3 space-y-1">
                      <div className="text-[10px] text-slate-500 font-mono">EXACT DENOMINATIONS & PRICING:</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.packages.map((pkg, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-[#1A1D26] border border-[#2B303E] text-emerald-400 font-mono text-[10px]">
                            {pkg.package_value} {pkg.package_currency} (${pkg.payment_price} USD)
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#1C202B] flex justify-between items-center text-[10px] font-mono text-slate-500">
                    <span>ID: {p.id}</span>
                    <span className="text-emerald-400">✓ In Stock</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: PENDING APPROVALS & FULFILLMENTS */}
        {activeTab === 'approvals' && (
          <div className="flex-1 flex flex-col min-h-0 mt-3 overflow-y-auto">
            {pendingFulfillments.length === 0 ? (
              <div className="bg-[#12141A] border border-[#1E222B] rounded-xl p-8 text-center text-slate-400 font-mono text-xs my-auto">
                No pending verified contributions awaiting fulfillment. Merged contributions verified above policy score appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingFulfillments.map((c) => (
                  <div key={c.id} className="bg-[#13151D] border border-[#20242F] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-200">PR #{c.prNumber}: {c.prTitle}</span>
                        {!c.isDemo && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold">
                            LIVE GITHUB
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        Contributor: @{c.contributor} • Score: {c.evaluationScore.toFixed(0)}/100 • Status: {c.verificationStatus}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        Recipient Target: {c.evidenceDetails?.recipient?.email || c.evidenceDetails?.recipient?.phone || 'Mapped: Account'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="bg-[#181B24] border border-[#2A2E3B] rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono cursor-pointer"
                      >
                        <option value="swiggy-money-india">Swiggy ₹50 ($0.55)</option>
                        <option value="airtel-india">Airtel ₹10 ($0.11)</option>
                        <option value="zomato-india">Zomato ₹250 ($2.75)</option>
                        <option value="esim-india-1gb">eSIM India 1GB ($3.88)</option>
                      </select>

                      <button
                        onClick={() => handleExecuteFulfillment(c.id)}
                        disabled={isFulfilling || isFrozen}
                        className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg ${
                          isFrozen
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                        }`}
                      >
                        {isFulfilling ? 'Fulfilling via Bitrefill...' : 'Authorize & Fulfil'}
                      </button>
                    </div>
                  </div>
                ))}

                {fulfillmentMessage && (
                  <div className="bg-[#14161E] border border-emerald-500/40 rounded-xl p-3 text-xs font-mono text-emerald-300">
                    {fulfillmentMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FULFILLMENT HISTORY */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col min-h-0 mt-3 overflow-y-auto">
            {rewards.length === 0 ? (
              <div className="bg-[#12141A] border border-[#1E222B] rounded-xl p-8 text-center text-slate-400 font-mono text-xs my-auto">
                No rewards have been fulfilled yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-slate-500 border-b border-[#1E222C]">
                    <th className="py-2">RECIPIENT & PR</th>
                    <th>PRODUCT</th>
                    <th>PRICE (USD)</th>
                    <th>INVOICE ID</th>
                    <th>ORDER STATUS</th>
                    <th>VOUCHER (MASKED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1D24] text-slate-300">
                  {rewards.map((r) => (
                    <tr key={r.id} className="hover:bg-[#13151D] transition-colors">
                      <td className="py-2.5">
                        <div className="font-semibold text-slate-200">@{r.contributor}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.isDemo ? 'Demo Seed' : 'Live Reward'}
                        </div>
                      </td>
                      <td>
                        <div className="text-slate-200">{r.productName}</div>
                        <div className="text-[10px] text-slate-500">{r.packageValue} {r.packageCurrency}</div>
                      </td>
                      <td>
                        <span className="text-emerald-400 font-bold">${r.priceUsd.toFixed(2)}</span>
                      </td>
                      <td>
                        <span className="text-slate-400 font-mono text-[11px]">{r.invoiceId}</span>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-[10px] border font-semibold ${
                          r.orderStatus === 'delivered' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                          r.orderStatus === 'processing' ? 'bg-sky-950/60 border-sky-500/40 text-sky-400' :
                          'bg-rose-950/60 border-rose-500/40 text-rose-400'
                        }`}>
                          {r.orderStatus.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="bg-[#181B24] border border-[#2B303E] px-2 py-0.5 rounded font-mono text-[10px] text-slate-300">
                          {r.maskedVoucherCode || '••••-••••'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
