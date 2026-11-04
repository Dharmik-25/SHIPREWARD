import React, { useState } from 'react';
import { ProgramPolicy } from '@shipreward/shared';
import { updateProgramme } from '../services/api';
import { Shield, Sparkles, Building2, GraduationCap, CheckCircle2, Sliders } from 'lucide-react';

interface ProgrammesViewProps {
  programmes: ProgramPolicy[];
  onRefresh: () => void;
}

export const ProgrammesView: React.FC<ProgrammesViewProps> = ({ programmes, onRefresh }) => {
  const [editingProgram, setEditingProgram] = useState<ProgramPolicy | null>(null);
  const [minScore, setMinScore] = useState(70);
  const [rewardAmount, setRewardAmount] = useState(5.0);
  const [dailyBudget, setDailyBudget] = useState(25.0);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = (prog: ProgramPolicy) => {
    setEditingProgram(prog);
    setMinScore(prog.minScore);
    setRewardAmount(prog.perContributionRewardUsd);
    setDailyBudget(prog.dailyBudgetUsd);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram) return;

    setIsSaving(true);
    try {
      await updateProgramme(editingProgram.id, {
        minScore,
        perContributionRewardUsd: rewardAmount,
        dailyBudgetUsd: dailyBudget
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
        <div className="flex justify-between items-center pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Reward Programmes (3 Tiers)</h2>
            <p className="text-xs text-slate-400">
              One shared deterministic verification engine with tailored policies for Campus, Builder, and Enterprise.
            </p>
          </div>
          <div className="px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 font-mono text-xs">
            Shared Engine Active
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {programmes.map((p) => {
            const isBuilder = p.tier === 'BUILDER';
            const isCampus = p.tier === 'CAMPUS';

            return (
              <div 
                key={p.id}
                className={`bg-[#13151D] border rounded-xl p-4 flex flex-col justify-between transition-all ${
                  isBuilder 
                    ? 'border-emerald-600/40 shadow-[0_0_20px_rgba(16,185,129,0.06)]' 
                    : 'border-[#202430]'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      isBuilder ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                      isCampus ? 'bg-blue-950/60 border-blue-500/40 text-blue-400' :
                      'bg-purple-950/60 border-purple-500/40 text-purple-400'
                    }`}>
                      {p.tier} TIER {isBuilder && '(PRIMARY TARGET)'}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-200">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 min-h-[36px]">{p.description}</p>

                  <div className="mt-4 space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Repository:</span>
                      <span className="text-slate-200">{p.repository}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Target Branch:</span>
                      <span className="text-slate-200">{p.targetBranch}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Min Score Gate:</span>
                      <span className="text-emerald-400">{p.minScore} / 100</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Reward / PR:</span>
                      <span className="text-emerald-400 font-bold">${p.perContributionRewardUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Daily Budget Cap:</span>
                      <span className="text-slate-200">${p.dailyBudgetUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Auto-Fulfillment:</span>
                      <span className={p.autoFulfill ? 'text-emerald-400' : 'text-amber-400'}>
                        {p.autoFulfill ? 'Autonomous' : 'Manual Sign-off'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenEdit(p)}
                  className={`mt-4 w-full py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    isBuilder
                      ? 'bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-600/40 text-emerald-400'
                      : 'bg-[#1A1D26] hover:bg-[#232733] border border-[#2B303E] text-slate-300'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure Guardrails</span>
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
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              Configure {editingProgram.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Update policy scoring criteria and expenditure caps.</p>

            <form onSubmit={handleSave} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">MINIMUM EVALUATION SCORE (0-100)</label>
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
                <label className="text-slate-400 block mb-1">REWARD AMOUNT PER PR (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(Number(e.target.value))}
                  className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">DAILY SPEND BUDGET (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(Number(e.target.value))}
                  className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
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

