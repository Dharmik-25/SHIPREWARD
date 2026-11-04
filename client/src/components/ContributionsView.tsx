import React, { useState } from 'react';
import { Contribution } from '@shipreward/shared';
import { GitPullRequest, ExternalLink, ShieldAlert, CheckCircle2, Clock, Award, UserCheck } from 'lucide-react';

interface ContributionsViewProps {
  contributions: Contribution[];
  onInspect: (contrib: Contribution) => void;
}

export const ContributionsView: React.FC<ContributionsViewProps> = ({ contributions, onInspect }) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterTier, setFilterTier] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [demoFilter, setDemoFilter] = useState<'ALL' | 'LIVE' | 'DEMO'>('ALL');

  const filtered = contributions.filter(c => {
    if (filterStatus === 'PENDING_APPROVAL') {
      if (c.approvalStatus !== 'PENDING_APPROVAL') return false;
    } else if (filterStatus !== 'ALL' && c.verificationStatus !== filterStatus) {
      return false;
    }

    if (filterTier !== 'ALL' && (c.rewardTier || 'GOOD') !== filterTier) {
      return false;
    }

    if (demoFilter === 'LIVE' && c.isDemo) return false;
    if (demoFilter === 'DEMO' && !c.isDemo) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.prTitle.toLowerCase().includes(q) ||
        c.contributor.toLowerCase().includes(q) ||
        String(c.prNumber).includes(q)
      );
    }
    return true;
  });

  const tierColors: Record<string, string> = {
    INSUFFICIENT: 'border-slate-700 bg-slate-900/60 text-slate-400',
    BASIC: 'border-blue-500/40 bg-blue-950/50 text-blue-400',
    GOOD: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-400',
    EXCELLENT: 'border-purple-500/40 bg-purple-950/50 text-purple-400',
    EXCEPTIONAL: 'border-amber-500/40 bg-amber-950/50 text-amber-300'
  };

  const pendingCount = contributions.filter(c => c.approvalStatus === 'PENDING_APPROVAL').length;

  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
        {/* Header & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Contributions & Evidence Registry</h2>
            <p className="text-xs text-slate-400">Incoming GitHub pull request events evaluated against deterministic verification rules and reward tiers.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live / Demo Filter */}
            <div className="bg-[#14161D] border border-[#20242F] rounded-xl p-1 flex text-xs font-mono">
              <button
                onClick={() => setDemoFilter('ALL')}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${demoFilter === 'ALL' ? 'bg-[#202430] text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                All ({contributions.length})
              </button>
              <button
                onClick={() => setDemoFilter('LIVE')}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${demoFilter === 'LIVE' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)]' : 'text-emerald-400/80 hover:text-emerald-300'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Live Webhooks ({contributions.filter(c => !c.isDemo).length})</span>
              </button>
              <button
                onClick={() => setDemoFilter('DEMO')}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${demoFilter === 'DEMO' ? 'bg-slate-800 text-slate-200 border border-slate-700 font-bold' : 'text-slate-400 hover:text-slate-300'}`}
              >
                Demo Seed ({contributions.filter(c => c.isDemo).length})
              </button>
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              {pendingCount > 0 && (
                <option value="PENDING_APPROVAL">Pending Approval ({pendingCount})</option>
              )}
              <option value="VERIFIED">Verified</option>
              <option value="NEEDS_REVIEW">Needs Review</option>
              <option value="FRAUD_FLAGGED">Fraud Flagged</option>
              <option value="REJECTED">Rejected</option>
              <option value="VERIFYING">Verifying</option>
              <option value="RECEIVED">Received</option>
            </select>

            {/* Tier Filter */}
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Reward Tiers</option>
              <option value="BASIC">Basic ($0.11 / ₹10)</option>
              <option value="GOOD">Good ($0.55 / ₹50)</option>
              <option value="EXCELLENT">Excellent ($1.10 / ₹100)</option>
              <option value="EXCEPTIONAL">Exceptional ($2.75 / ₹250)</option>
              <option value="INSUFFICIENT">Insufficient ($0.00)</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="my-3">
          <input
            type="text"
            placeholder="Search by title, PR number, or contributor handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#13151C] border border-[#20242F] rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-[#1E222C]">
                <th className="py-2.5">PULL REQUEST</th>
                <th>CONTRIBUTOR</th>
                <th>DIFF STATS</th>
                <th>CI / CHECKS</th>
                <th>SCORE</th>
                <th>REWARD TIER</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1D24] text-slate-300">
              {filtered.map((c) => {
                const tier = c.rewardTier || 'GOOD';
                return (
                  <tr key={c.id} className="hover:bg-[#13151D] transition-colors">
                    <td className="py-3">
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>PR #{c.prNumber}</span>
                        {c.isDemo ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px] font-mono">
                            DEMO SEED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            LIVE GITHUB
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{c.prTitle}</div>
                    </td>

                    <td>
                      <div className="text-slate-200 font-medium">@{c.contributor}</div>
                      <div className="text-[10px] text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</div>
                    </td>

                    <td>
                      <span className="text-emerald-400">+{c.additions}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-rose-400">-{c.deletions}</span>
                      <div className="text-[10px] text-slate-500">{c.changedFilesCount} files</div>
                    </td>

                    <td>
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${
                        c.ciStatus === 'passed' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                        c.ciStatus === 'failed' ? 'bg-rose-950/60 border-rose-500/40 text-rose-400' :
                        'bg-slate-800 border-slate-700 text-slate-400'
                      }`}>
                        {c.ciStatus}
                      </span>
                    </td>

                    <td>
                      <div className="font-bold text-slate-200">{c.evaluationScore.toFixed(0)} / 100</div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold w-fit ${tierColors[tier] || tierColors.GOOD}`}>
                          {tier}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ${c.suggestedRewardUsd?.toFixed(2) || '0.55'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] border font-semibold w-fit ${
                          c.verificationStatus === 'VERIFIED' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                          c.verificationStatus === 'FRAUD_FLAGGED' ? 'bg-rose-950/60 border-rose-500/40 text-rose-400' :
                          c.verificationStatus === 'REJECTED' ? 'bg-red-950/60 border-red-500/40 text-red-400' :
                          c.verificationStatus === 'VERIFYING' ? 'bg-sky-950/60 border-sky-500/40 text-sky-400 animate-pulse' :
                          c.verificationStatus === 'RECEIVED' ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-400' :
                          c.verificationStatus === 'NEEDS_REVIEW' ? 'bg-amber-950/60 border-amber-500/40 text-amber-400' :
                          'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          {c.verificationStatus}
                        </span>
                        {c.approvalStatus === 'PENDING_APPROVAL' && (
                          <span className="text-[10px] text-amber-400 font-bold">Needs Approval</span>
                        )}
                        {c.approvalStatus === 'APPROVED' && (
                          <span className="text-[10px] text-emerald-400">Approved</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        onClick={() => onInspect(c)}
                        className="px-2.5 py-1 rounded-lg bg-[#181B24] hover:bg-[#202430] border border-[#2B303E] text-slate-200 text-xs font-mono cursor-pointer transition-all"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
