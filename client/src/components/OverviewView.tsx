import React from 'react';
import { 
  SystemHealth, 
  Contribution, 
  RewardRecord, 
  ProgramPolicy 
} from '@shipreward/shared';
import { 
  ArrowUpRight, 
  CheckCircle2, 
  ShieldAlert, 
  Layers, 
  Activity, 
  ExternalLink 
} from 'lucide-react';
import { ScreenId } from './layout/Sidebar';

interface OverviewViewProps {
  health?: SystemHealth;
  contributions: Contribution[];
  rewards: RewardRecord[];
  programmes: ProgramPolicy[];
  onSelectScreen: (screen: ScreenId) => void;
  onInspectContribution: (contrib: Contribution) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  health,
  contributions,
  rewards,
  programmes,
  onSelectScreen,
  onInspectContribution
}) => {
  // Financial metrics
  const liveSpend = health?.bitrefill?.spentTodayUsd || 0;
  const liveRewardsDelivered = health?.metrics?.liveRewardsDelivered || 0;
  const demoRewardsDelivered = health?.metrics?.demoRewardsDelivered || 0;
  const totalVerifiedCount = contributions.filter(c => c.verificationStatus === 'VERIFIED').length;
  const fraudCount = contributions.filter(c => c.verificationStatus === 'FRAUD_FLAGGED').length;

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 w-full">
      {/* Left Main Card: Visual Transaction & Volume Chart (Reference Design Style) */}
      <div className="flex-[3] bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div className="flex items-center gap-3">
            <div className="font-mono text-xs text-slate-300">
              <span className="text-slate-500">programme_analytics / </span>verified_rewards_timeline.agg
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-[#15171E] border border-[#232733] px-3 py-1 rounded-lg text-xs font-mono text-slate-400 flex items-center gap-2">
              <span>📅 Nov 01 - Nov 05, 2026</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 px-2.5 py-1 rounded-lg text-xs font-mono">
              Autonomous Verification: Active
            </div>
          </div>
        </div>

        {/* Metrics Summary Grid with Strict Separation of Demo vs Live */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[11px] text-slate-500 font-mono uppercase">Live Spend Today</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-1">
              ${liveSpend.toFixed(2)}
              <span className="text-xs text-slate-400 font-normal"> / ${health?.bitrefill?.dailySpendCapUsd.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              {liveRewardsDelivered} live purchases fulfilled
            </div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[11px] text-slate-500 font-mono uppercase">Verified PRs</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-1">
              {totalVerifiedCount} <span className="text-xs text-slate-400 font-normal">total</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Deterministic policy score &gt; threshold
            </div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[11px] text-slate-500 font-mono uppercase">Fraud Prevented</div>
            <div className="text-xl font-bold text-rose-400 font-mono mt-1">
              {fraudCount} <span className="text-xs text-slate-400 font-normal">blocked</span>
            </div>
            <div className="text-[10px] text-rose-400 mt-0.5">
              Self-approval & duplicate prevention
            </div>
          </div>

          <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
            <div className="text-[11px] text-slate-500 font-mono uppercase">Active Tiers</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-1">
              {programmes.length} <span className="text-xs text-slate-400 font-normal">programmes</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              Builder, Campus, Enterprise
            </div>
          </div>
        </div>

        {/* Dual-Bar Flow Chart (Recreation of user reference image) */}
        <div className="flex-1 bg-[#12141A] border border-[#1C202A] rounded-xl p-4 flex flex-col justify-between my-2 relative overflow-hidden">
          <div className="flex justify-between items-center text-xs text-slate-400 font-mono mb-2">
            <span>REWARD VALUE FLOW (GREEN: ISSUED REWARDS, RED: REJECTED/FRAUD ATTEMPTS)</span>
            <span className="text-emerald-400 font-bold font-mono">
              Live: ${liveSpend.toFixed(2)} | Demo Seed: {demoRewardsDelivered} cycles
            </span>
          </div>

          {/* Bar Columns */}
          <div className="flex-1 flex items-center justify-around gap-3 pt-6 pb-2 min-h-[160px]">
            {/* Day 1 */}
            <div className="flex flex-col items-center gap-1.5 h-full justify-center">
              <div className="text-[10px] text-emerald-400 font-mono">$35.00</div>
              <div className="w-8 bg-emerald-500 rounded-md h-20 shadow-[0_0_12px_rgba(16,185,129,0.2)]"></div>
              <div className="w-8 bg-rose-500/80 rounded-md h-8 mt-1"></div>
              <div className="text-[10px] text-rose-400 font-mono">$10.00</div>
              <div className="text-[11px] text-slate-500 font-mono mt-2">01 Nov</div>
            </div>

            {/* Day 2 */}
            <div className="flex flex-col items-center gap-1.5 h-full justify-center">
              <div className="text-[10px] text-emerald-400 font-mono">$65.00</div>
              <div className="w-8 bg-emerald-500 rounded-md h-32 shadow-[0_0_12px_rgba(16,185,129,0.2)]"></div>
              <div className="w-8 bg-rose-500/80 rounded-md h-12 mt-1"></div>
              <div className="text-[10px] text-rose-400 font-mono">$15.00</div>
              <div className="text-[11px] text-slate-500 font-mono mt-2">02 Nov</div>
            </div>

            {/* Day 3 */}
            <div className="flex flex-col items-center gap-1.5 h-full justify-center">
              <div className="text-[10px] text-emerald-400 font-mono">$48.00</div>
              <div className="w-8 bg-emerald-500 rounded-md h-24 shadow-[0_0_12px_rgba(16,185,129,0.2)]"></div>
              <div className="w-8 bg-rose-500/80 rounded-md h-16 mt-1"></div>
              <div className="text-[10px] text-rose-400 font-mono">$20.00</div>
              <div className="text-[11px] text-slate-500 font-mono mt-2">03 Nov</div>
            </div>

            {/* Day 4 (Today) */}
            <div className="flex flex-col items-center gap-1.5 h-full justify-center">
              <div className="text-[10px] text-emerald-400 font-mono">${(liveSpend + 15).toFixed(2)}</div>
              <div className="w-8 bg-emerald-500 rounded-md h-36 shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
              <div className="w-8 bg-rose-500/80 rounded-md h-10 mt-1"></div>
              <div className="text-[10px] text-rose-400 font-mono">$8.00</div>
              <div className="text-[11px] text-emerald-400 font-mono font-bold mt-2">04 Nov (Today)</div>
            </div>

            {/* Day 5 (Forecast) */}
            <div className="flex flex-col items-center gap-1.5 h-full justify-center opacity-60">
              <div className="text-[10px] text-slate-400 font-mono">Cap: $25</div>
              <div className="w-8 bg-slate-700 border border-dashed border-slate-500 rounded-md h-20"></div>
              <div className="w-8 h-8"></div>
              <div className="text-[11px] text-slate-500 font-mono mt-2">05 Nov</div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-500 font-mono pt-2 border-t border-[#1C202A]">
            <span>Showing verified reward cycles & rejection volume</span>
            <span className="text-slate-400">Total cycles evaluated: {contributions.length}</span>
          </div>
        </div>

        {/* Footer info link */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400 font-mono">
            Autonomous Event Listener active on <code className="text-slate-300">/api/webhooks/github</code>
          </span>
          <button 
            onClick={() => onSelectScreen('verification')}
            className="text-xs text-emerald-400 hover:text-emerald-300 underline font-mono flex items-center gap-1 cursor-pointer"
          >
            Inspect Verification Engine →
          </button>
        </div>
      </div>

      {/* Right Panel: Autonomous Activity Stream */}
      <div className="flex-[2] bg-[#0E1014] border border-[#1E222B] rounded-2xl p-4 flex flex-col justify-between shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1D24]">
          <div className="text-sm font-semibold text-slate-200">Autonomous Activity Stream</div>
          <button 
            onClick={() => onSelectScreen('audit')}
            className="bg-[#EA580C] hover:bg-[#D94F04] text-white px-2.5 py-1 rounded-lg text-xs font-mono font-medium cursor-pointer"
          >
            Export Audit
          </button>
        </div>

        {/* Table List of Recent Activity */}
        <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1">
          {contributions.slice(0, 7).map((c) => (
            <div
              key={c.id}
              onClick={() => onInspectContribution(c)}
              className="bg-[#13151C] hover:bg-[#181B23] border border-[#1E222C] rounded-xl p-3 flex items-center justify-between text-xs cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${
                  c.verificationStatus === 'VERIFIED' ? 'bg-emerald-400' :
                  c.verificationStatus === 'FRAUD_FLAGGED' ? 'bg-rose-500' : 'bg-amber-400'
                }`} />
                <div>
                  <div className="font-mono font-medium text-slate-200 flex items-center gap-2">
                    <span>PR #{c.prNumber}: {c.prTitle.length > 28 ? c.prTitle.slice(0, 28) + '...' : c.prTitle}</span>
                    {c.isDemo ? (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-mono">
                        DEMO SEED
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[9px] font-mono font-bold">
                        LIVE GITHUB
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    @{c.contributor} • Score: {c.evaluationScore.toFixed(0)}/100
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`font-mono font-medium ${
                  c.verificationStatus === 'VERIFIED' ? 'text-emerald-400' :
                  c.verificationStatus === 'FRAUD_FLAGGED' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {c.verificationStatus}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#1A1D24] flex justify-between items-center text-[11px] font-mono text-slate-500">
          <span>Bitrefill MCP Fulfillment</span>
          <span className="text-emerald-400">Real & Safe Test Cycles</span>
        </div>
      </div>
    </div>
  );
};

