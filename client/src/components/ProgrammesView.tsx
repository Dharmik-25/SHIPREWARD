import React, { useState } from 'react';
import { ProgramPolicy } from '@shipreward/shared';
import { updateProgramme } from '../services/api';
import { 
  Building2, 
  GraduationCap, 
  CheckCircle2, 
  Sliders, 
  Users, 
  Wallet, 
  Award, 
  FileText, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface ProgrammesViewProps {
  programmes: ProgramPolicy[];
  onRefresh: () => void;
}

export const ProgrammesView: React.FC<ProgrammesViewProps> = ({ programmes, onRefresh }) => {
  const [editingProgram, setEditingProgram] = useState<ProgramPolicy | null>(null);
  const [owner, setOwner] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [minScore, setMinScore] = useState(70);
  const [rewardAmount, setRewardAmount] = useState(0.55);
  const [approvalThreshold, setApprovalThreshold] = useState(1.00);
  const [dailyBudget, setDailyBudget] = useState(5.0);
  const [autoFulfill, setAutoFulfill] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = (prog: ProgramPolicy) => {
    setEditingProgram(prog);
    setOwner(prog.owner || '');
    setFundingSource(prog.fundingSource || '');
    setMinScore(prog.minScore);
    setRewardAmount(prog.perContributionRewardUsd);
    setApprovalThreshold(prog.approvalThresholdUsd || 1.00);
    setDailyBudget(prog.dailyBudgetUsd);
    setAutoFulfill(Boolean(prog.autoFulfill));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram) return;

    setIsSaving(true);
    try {
      await updateProgramme(editingProgram.id, {
        owner,
        fundingSource,
        minScore,
        perContributionRewardUsd: rewardAmount,
        approvalThresholdUsd: approvalThreshold,
        dailyBudgetUsd: dailyBudget,
        autoFulfill
      });
      setEditingProgram(null);
      onRefresh();
    } catch (err: any) {
      alert(`Error saving policy: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500">MULTI-TIER ARCHITECTURE</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold">
                SHARED DETERMINISTIC ENGINE
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-100 mt-1">Autonomous Reward Programmes</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Three distinct user tiers with dedicated funding pools, evidence rubrics, and approval thresholds.
            </p>
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {programmes.map((p) => {
            const isBuilder = p.tier === 'BUILDER';
            const isCampus = p.tier === 'CAMPUS';
            const isEnterprise = p.tier === 'ENTERPRISE';

            const tierColor = isBuilder ? 'emerald' : isCampus ? 'blue' : 'purple';

            return (
              <div 
                key={p.id}
                className={`bg-[#13151D] border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                  isBuilder 
                    ? 'border-emerald-600/40 shadow-[0_0_24px_rgba(16,185,129,0.08)] ring-1 ring-emerald-500/20' 
                    : isCampus
                    ? 'border-blue-600/30 shadow-[0_0_20px_rgba(59,130,246,0.06)]'
                    : 'border-purple-600/30 shadow-[0_0_20px_rgba(168,85,247,0.06)]'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border flex items-center gap-1.5 ${
                      isBuilder ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300' :
                      isCampus ? 'bg-blue-950/70 border-blue-500/40 text-blue-300' :
                      'bg-purple-950/70 border-purple-500/40 text-purple-300'
                    }`}>
                      {isBuilder && <Award className="w-3 h-3 text-emerald-400" />}
                      {isCampus && <GraduationCap className="w-3 h-3 text-blue-400" />}
                      {isEnterprise && <Building2 className="w-3 h-3 text-purple-400" />}
                      {p.tier} TIER {isBuilder ? '· LIVE TARGET' : '· SAMPLE CONFIGURATION'}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1.5 min-h-[48px] leading-relaxed">{p.description}</p>

                  {/* Owner & Funding Pool Details */}
                  <div className="bg-[#101218] border border-[#1C202B] rounded-xl p-3 my-3 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1.5 text-[11px]"><Users className="w-3 h-3 text-slate-500" /> Owner:</span>
                      <span className="text-slate-200 text-[11px] font-medium">{p.owner || 'Programme Lead'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1.5 text-[11px]"><Wallet className="w-3 h-3 text-slate-500" /> Funding Pool:</span>
                      <span className="text-slate-200 text-[11px]">
                        {p.fundingSource || 'Treasury Pool'} {!isBuilder && <span className="text-[9px] text-slate-500 font-normal">(Simulated)</span>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1.5 text-[11px]"><ShieldCheck className="w-3 h-3 text-slate-500" /> Approval Cap:</span>
                      <span className="text-amber-400 text-[11px]">&gt;= ${(p.approvalThresholdUsd || 1.00).toFixed(2)} USD</span>
                    </div>
                  </div>

                  {/* Policy Parameters */}
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Repository:</span>
                      <span className="text-slate-200 font-semibold">{p.repository}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Target Branch:</span>
                      <span className="text-slate-200">{p.targetBranch}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Min Passing Score:</span>
                      <span className="text-emerald-400 font-bold">{p.minScore} / 100</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Base Reward / PR:</span>
                      <span className="text-emerald-400 font-bold">${p.perContributionRewardUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Daily Budget Cap:</span>
                      <span className="text-slate-200">${p.dailyBudgetUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Budget Spent Today:</span>
                      <span className="text-slate-300">
                        ${(p.spentTodayUsd || 0).toFixed(2)} / ${p.dailyBudgetUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 pt-1 border-t border-[#1C202B]">
                      <span>Fulfillment Mode:</span>
                      <span className={p.autoFulfill ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                        {p.autoFulfill ? '⚡ Autonomous (< threshold)' : '✋ Manual Approval Only'}
                      </span>
                    </div>
                  </div>

                  {/* Rubric Criteria Preview */}
                  {p.rubricCriteria && p.rubricCriteria.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-[#1C202B]">
                      <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1.5 font-bold">
                        EVALUATION RUBRIC & WEIGHTS
                      </span>
                      <div className="space-y-1">
                        {p.rubricCriteria.map((c, i) => (
                          <div key={i} className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span className="truncate max-w-[180px]">{c.name}</span>
                            <span className="text-slate-300 font-bold">{c.weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleOpenEdit(p)}
                  className={`mt-4 w-full py-2 rounded-xl text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    isBuilder
                      ? 'bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-600/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-semibold'
                      : 'bg-[#181B24] hover:bg-[#202430] border border-[#2B303E] text-slate-300'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure Guardrails & Rubric</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Policy Drawer / Modal */}
      {editingProgram && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0E1014] border border-[#232834] rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-semibold text-slate-100">
                Configure {editingProgram.name}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-slate-700 text-slate-400">
                {editingProgram.tier}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Update programme owner, isolated funding pool, approval thresholds, and spend limits.
            </p>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">PROGRAMME OWNER / LEAD</label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">FUNDING SOURCE POOL</label>
                <input
                  type="text"
                  value={fundingSource}
                  onChange={(e) => setFundingSource(e.target.value)}
                  className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">MIN PASSING SCORE (0-100)</label>
                  <input
                    type="number"
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    min={1}
                    max={100}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">APPROVAL THRESHOLD (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={approvalThreshold}
                    onChange={(e) => setApprovalThreshold(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-amber-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">BASE REWARD (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">DAILY BUDGET (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#1E222B]">
                <button
                  type="button"
                  onClick={() => setEditingProgram(null)}
                  className="px-4 py-2 bg-[#14161D] hover:bg-[#1E222C] text-slate-300 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
