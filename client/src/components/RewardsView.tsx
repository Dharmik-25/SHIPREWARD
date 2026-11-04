import React, { useState } from 'react';
import { RewardRecord } from '@shipreward/shared';
import { Gift, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface RewardsViewProps {
  rewards: RewardRecord[];
}

export const RewardsView: React.FC<RewardsViewProps> = ({ rewards }) => {
  const [filterDemo, setFilterDemo] = useState<'ALL' | 'LIVE' | 'DEMO'>('ALL');

  const filtered = rewards.filter(r => {
    if (filterDemo === 'LIVE' && r.isDemo) return false;
    if (filterDemo === 'DEMO' && !r.isDemo) return false;
    return true;
  });

  const totalDisbursed = filtered.reduce((acc, r) => acc + (r.orderStatus === 'delivered' ? r.priceUsd : 0), 0);

  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Rewards Fulfilment Registry</h2>
            <p className="text-xs text-slate-400">
              Purchases autonomously initiated by the agent and tracked until Bitrefill confirmed delivery.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <div className="bg-[#14161D] border border-[#20242F] rounded-xl p-1 flex text-xs font-mono">
              <button
                onClick={() => setFilterDemo('ALL')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${filterDemo === 'ALL' ? 'bg-[#202430] text-slate-200' : 'text-slate-400'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterDemo('LIVE')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${filterDemo === 'LIVE' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40' : 'text-slate-400'}`}
              >
                Live Purchases
              </button>
              <button
                onClick={() => setFilterDemo('DEMO')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${filterDemo === 'DEMO' ? 'bg-blue-950/60 text-blue-400 border border-blue-500/40' : 'text-slate-400'}`}
              >
                Demo Seed
              </button>
            </div>

            <div className="text-xs font-mono text-slate-400">
              Total Disbursed: <span className="text-emerald-400 font-bold">${totalDisbursed.toFixed(2)} USD</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto my-3">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-[#1E222C]">
                <th className="py-2.5">REWARD ID</th>
                <th>CONTRIBUTOR</th>
                <th>PRODUCT & PACKAGE</th>
                <th>BITREFILL INVOICE</th>
                <th>ORDER STATUS</th>
                <th>MASKED CODE</th>
                <th>DELIVERED AT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1D24] text-slate-300">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-[#13151D] transition-colors">
                  <td className="py-3 font-semibold text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <span>#{r.id.slice(0, 10)}</span>
                      {r.isDemo && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px]">
                          DEMO
                        </span>
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="text-slate-200 font-medium">@{r.contributor}</div>
                    <div className="text-[10px] text-slate-500">{r.recipientEmail || r.recipientPhone || 'Account direct'}</div>
                  </td>

                  <td>
                    <div className="text-slate-200">{r.productName}</div>
                    <div className="text-[10px] text-emerald-400">
                      {r.packageValue} {r.packageCurrency} (${r.priceUsd.toFixed(2)})
                    </div>
                  </td>

                  <td>
                    <div className="text-slate-300 font-mono text-[11px]">{r.invoiceId}</div>
                    <div className="text-[10px] text-slate-500">inv_status: {r.invoiceStatus}</div>
                  </td>

                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      r.orderStatus === 'delivered' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                      r.orderStatus === 'failed' ? 'bg-rose-950/60 border-rose-500/40 text-rose-400' :
                      'bg-amber-950/60 border-amber-500/40 text-amber-400'
                    }`}>
                      {r.orderStatus}
                    </span>
                  </td>

                  <td>
                    <span className="bg-[#181B24] border border-[#2B303E] px-2 py-0.5 rounded text-slate-300 text-[11px]">
                      {r.maskedVoucherCode || '••••-••••-••••'}
                    </span>
                  </td>

                  <td>
                    <span className="text-slate-400 text-[11px]">
                      {r.deliveredAt ? new Date(r.deliveredAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-3 border-t border-[#1A1D24] text-[11px] font-mono text-slate-500 flex justify-between items-center">
          <span>Security Protocol: Voucher codes are strictly redacted and masked in responses.</span>
          <span className="text-emerald-400 font-medium">Delivered = Verified Fulfilment</span>
        </div>
      </div>
    </div>
  );
};

