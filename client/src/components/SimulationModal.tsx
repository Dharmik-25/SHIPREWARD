import React, { useState } from 'react';
import { X, Zap, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { triggerSimulation } from '../services/api';

interface SimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SimulationModal: React.FC<SimulationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [programId, setProgramId] = useState('prog_builder_core');
  const [prNumber, setPrNumber] = useState(105);
  const [prTitle, setPrTitle] = useState('fix(core): eliminate memory leak in event listener buffer');
  const [contributor, setContributor] = useState('alex-dev');
  const [additions, setAdditions] = useState(48);
  const [deletions, setDeletions] = useState(12);
  const [ciStatus, setCiStatus] = useState<'passed' | 'failed' | 'pending'>('passed');
  const [maintainerApproved, setMaintainerApproved] = useState(true);
  const [selfApproved, setSelfApproved] = useState(false);
  const [productId, setProductId] = useState('swiggy-india');
  const [packageValue, setPackageValue] = useState('500');

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await triggerSimulation({
        programId,
        prNumber: Number(prNumber),
        prTitle,
        contributor,
        changedFilesCount: 2,
        additions: Number(additions),
        deletions: Number(deletions),
        ciStatus,
        maintainerApproved,
        selfApproved,
        productId,
        packageValue
      });

      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Trigger failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0E1014] border border-[#232834] rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-4 border-b border-[#1E222B]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-600/20 border border-orange-500/30 text-orange-400">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Autonomous Trigger Testbed</h3>
              <p className="text-xs text-slate-400">Simulate a real GitHub PR merge event and observe deterministic verification & Bitrefill fulfilment.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-[#181B22] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result ? (
            /* Result Outcome View */
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                result.verificationStatus === 'VERIFIED'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : result.verificationStatus === 'FRAUD_FLAGGED'
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              }`}>
                {result.verificationStatus === 'VERIFIED' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-sm">
                    Decision: {result.verificationStatus} (Score: {result.score}/100)
                  </div>
                  <div className="text-xs opacity-90 mt-0.5">{result.explanation}</div>
                </div>
              </div>

              {result.rewardId && (
                <div className="bg-[#14161D] border border-[#20242F] p-4 rounded-xl space-y-2">
                  <div className="text-xs text-slate-400 font-mono">AUTONOMOUS BITREFILL FULFILMENT COMPLETED</div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-400">Contribution ID:</span>
                    <span className="text-slate-200">{result.contributionId}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-400">Reward ID:</span>
                    <span className="text-emerald-400 font-bold">{result.rewardId}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    * Flagged as <span className="text-emerald-400 font-mono">DEMO SEED</span> in dashboard so mock funds are never mixed with live event credits.
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="px-4 py-2 bg-[#1A1D26] hover:bg-[#232733] border border-[#2B303E] rounded-xl text-xs font-mono text-slate-200 cursor-pointer"
                >
                  Test Another Scenario
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold font-mono cursor-pointer"
                >
                  View in Dashboard →
                </button>
              </div>
            </div>
          ) : (
            /* Input Form */
            <form onSubmit={handleTrigger} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">PROGRAMME TIER</label>
                  <select
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="prog_builder_core">Builder: Open-Source Engine Core</option>
                    <option value="prog_campus_cs401">Campus: CS401 Distributed Systems</option>
                    <option value="prog_enterprise_infra">Enterprise: Fintech Platform Org</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">PR NUMBER</label>
                  <input
                    type="number"
                    value={prNumber}
                    onChange={(e) => setPrNumber(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">PULL REQUEST TITLE</label>
                <input
                  type="text"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">CONTRIBUTOR</label>
                  <input
                    type="text"
                    value={contributor}
                    onChange={(e) => setContributor(e.target.value)}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">ADDITIONS (+)</label>
                  <input
                    type="number"
                    value={additions}
                    onChange={(e) => setAdditions(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">DELETIONS (-)</label>
                  <input
                    type="number"
                    value={deletions}
                    onChange={(e) => setDeletions(Number(e.target.value))}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-rose-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Fraud and Deterministic Conditions Controls */}
              <div className="p-3 bg-[#13151D] border border-[#1E222C] rounded-xl space-y-2.5">
                <div className="text-[11px] text-slate-400 font-semibold uppercase">Verification & Fraud Test Gates</div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ciStatus === 'passed'}
                      onChange={(e) => setCiStatus(e.target.checked ? 'passed' : 'failed')}
                      className="rounded bg-[#1A1D26] border-[#2B303E] text-emerald-500"
                    />
                    <span className="text-slate-300">CI Suite Passing</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintainerApproved}
                      onChange={(e) => setMaintainerApproved(e.target.checked)}
                      className="rounded bg-[#1A1D26] border-[#2B303E] text-emerald-500"
                    />
                    <span className="text-slate-300">Maintainer Approved</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-rose-300">
                    <input
                      type="checkbox"
                      checked={selfApproved}
                      onChange={(e) => setSelfApproved(e.target.checked)}
                      className="rounded bg-[#1A1D26] border-[#2B303E] text-rose-500"
                    />
                    <span className="text-rose-400 font-bold">Simulate Self-Approval (Fraud Test)</span>
                  </label>
                </div>
              </div>

              {/* Bitrefill Product Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">REWARD PRODUCT</label>
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      if (e.target.value === 'airtel-india') setPackageValue('120');
                      else if (e.target.value === 'jio-india') setPackageValue('15');
                      else setPackageValue('500');
                    }}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="swiggy-india">Swiggy Money Voucher (India)</option>
                    <option value="zomato-india">Zomato Gift Card (India)</option>
                    <option value="airtel-india">Airtel India Talktime (₹120)</option>
                    <option value="jio-india">Jio India Recharge (₹15)</option>
                    <option value="esim-india-1gb">Bitrefill eSIM India (1GB)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">PACKAGE DENOMINATION</label>
                  <input
                    type="text"
                    value={packageValue}
                    onChange={(e) => setPackageValue(e.target.value)}
                    className="w-full bg-[#14161D] border border-[#20242F] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#1E222B]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-[#14161D] hover:bg-[#1E222C] text-slate-300 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-[#EA580C] hover:bg-[#D94F04] disabled:opacity-50 text-white font-semibold rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-orange-950/40"
                >
                  {isLoading ? 'Agent Running Loop...' : 'Trigger Autonomous Flow'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
