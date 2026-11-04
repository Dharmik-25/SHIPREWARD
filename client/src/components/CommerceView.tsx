import React, { useState } from 'react';
import { BitrefillProductSummary, SystemHealth } from '@shipreward/shared';
import { ShoppingBag, Search, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';

interface CommerceViewProps {
  products: BitrefillProductSummary[];
  health?: SystemHealth;
}

export const CommerceView: React.FC<CommerceViewProps> = ({ products, health }) => {
  const [search, setSearch] = useState('');

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Bitrefill eCommerce Catalog</h2>
            <p className="text-xs text-slate-400">
              Verified gift cards, mobile refills, and eSIM packages discoverable through official Bitrefill MCP tools.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg border font-mono text-xs flex items-center gap-1.5 ${
              health?.bitrefill?.status === 'connected'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-950/50 border-amber-500/40 text-amber-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health?.bitrefill?.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              MCP Endpoint: {health?.bitrefill?.status === 'connected' ? 'Connected' : 'Offline / Unconfigured'}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="my-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search products by brand, category (food, refill, esim), or country code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#13151C] border border-[#20242F] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 overflow-y-auto flex-1 my-2">
          {filtered.map((p) => (
            <div key={p.id} className="bg-[#13151D] border border-[#202430] p-4 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">{p.category}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">{p.country}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-200">{p.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{p.description}</p>

                {/* Packages */}
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] text-slate-500 font-mono">DENOMINATIONS & EXACT PRICING:</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {p.packages.map((pkg, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-[#1A1D26] border border-[#2B303E] text-emerald-400 font-mono text-[10px]">
                        {pkg.package_value} {pkg.package_currency} (${pkg.payment_price} USD)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1C202B] flex justify-between items-center text-[10px] font-mono text-slate-500">
                <span>Product ID: {p.id}</span>
                <span className="text-emerald-400">In Stock</span>
              </div>
            </div>
          ))}
        </div>

        {/* Spend Guardrails Notification Bar */}
        <div className="bg-[#14161E] border border-amber-900/40 rounded-xl p-3.5 mt-3">
          <div className="text-xs font-mono font-semibold text-amber-400 mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>COMMERCE SPEND GUARDRAILS ENFORCED IN CODE</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono text-slate-300 mt-2">
            <div>Single Reward Cap: <span className="text-emerald-400 font-bold">$10.00 USD</span></div>
            <div>Daily Hard Spend Cap: <span className="text-emerald-400 font-bold">$25.00 USD</span></div>
            <div>Payment Mechanism: <span className="text-slate-200">Account Balance (Event Credits)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

