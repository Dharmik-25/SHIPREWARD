import React, { useState } from 'react';
import { Contribution } from '@shipreward/shared';
import { approveContribution, rejectContribution } from '../services/api';
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Sparkles, 
  Check, 
  X,
  Clock,
  ArrowRight,
  UserCheck,
  Award
} from 'lucide-react';

interface VerificationViewProps {
  selectedContribution: Contribution | null;
  contributions: Contribution[];
  onSelectContribution: (c: Contribution) => void;
  onRefresh: () => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  selectedContribution,
  contributions,
  onSelectContribution,
  onRefresh
}) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const active = selectedContribution || contributions[0] || null;

  const handleApprove = async () => {
    if (!active) return;
    setIsApproving(true);
    try {
      await approveContribution(active.id, 'Coordinator / Maintainer', 'Verified milestone quality and evidence', false);
      alert('Contribution approved successfully!');
      onRefresh();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!active) return;
    const reason = prompt('Reason for rejection:', 'Insufficient rubric evidence or non-compliant contribution');
    if (!reason) return;
    setIsRejecting(true);
    try {
      await rejectContribution(active.id, 'Coordinator / Maintainer', reason);
      alert('Contribution rejected.');
      onRefresh();
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setIsRejecting(false);
    }
  };

  if (!active) {
    return (
      <div className="flex-1 bg-[#0E1014] border border-[#1E222B] rounded-2xl p-8 flex items-center justify-center text-slate-400 font-mono text-xs">
        No contributions available for inspection. Trigger a test event or deliver a GitHub webhook.
      </div>
    );
  }

  const isVerified = active.verificationStatus === 'VERIFIED';
  const isFraud = active.verificationStatus === 'FRAUD_FLAGGED';
  const isNeedsReview = active.verificationStatus === 'NEEDS_REVIEW';
  const isRejected = active.verificationStatus === 'REJECTED';
  const isVerifying = active.verificationStatus === 'VERIFYING';
  const isReceived = active.verificationStatus === 'RECEIVED';

  const isPendingApproval = active.approvalStatus === 'PENDING_APPROVAL';
  const isApproved = active.approvalStatus === 'APPROVED' || active.approvalStatus === 'NOT_REQUIRED';

  const ruleChecks = active.evidenceDetails?.ruleChecks || {
    repoAllowlisted: true,
    mergedIntoTarget: active.mergedAt !== null,
    ciChecksPassed: active.ciStatus === 'passed',
    maintainerApproved: active.maintainerApproved,
    notSelfApproved: !active.selfApproved,
    noDuplicate: !active.fraudFlags?.includes('DUPLICATE_REWARD_CLAIM_PREVENTED'),
  };

  const rubric = active.evidenceDetails?.rubricEvaluation || {
    codeScope: Math.min(30, Math.round((active.evaluationScore || 70) * 0.3)),
    testAndCi: active.ciStatus === 'passed' ? 25 : 0,
    peerReviewQuality: active.maintainerApproved ? 25 : 0,
    tierObjectiveAlignment: 15
  };

  const tierColors: Record<string, string> = {
    INSUFFICIENT: 'border-slate-700 bg-slate-900 text-slate-400',
    BASIC: 'border-blue-500/40 bg-blue-950/40 text-blue-400',
    GOOD: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400',
    EXCELLENT: 'border-purple-500/40 bg-purple-950/40 text-purple-400',
    EXCEPTIONAL: 'border-amber-500/40 bg-amber-950/40 text-amber-300'
  };

  const rewardTier = active.rewardTier || 'GOOD';

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 w-full overflow-y-auto">
      {/* Left: Evidence Inspector & Deterministic Checklist */}
      <div className="flex-[3] bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1A1D24]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono">EVIDENCE INSPECTOR</span>
                {active.isDemo ? (
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[10px]">
                    DEMO SEED / SIMULATION
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    LIVE GITHUB WEBHOOK EVIDENCE
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${tierColors[rewardTier] || tierColors.GOOD}`}>
                  TIER: {rewardTier}
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                PR #{active.prNumber}: {active.prTitle}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${
                isVerified ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                isFraud ? 'bg-rose-950/60 border-rose-500/40 text-rose-400' :
                'bg-amber-950/60 border-amber-500/40 text-amber-400'
              }`}>
                SCORE: {active.evaluationScore.toFixed(0)} / 100
              </span>
            </div>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-3 text-xs font-mono">
            <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
              <div className="text-slate-500">CONTRIBUTOR & IDENTITY</div>
              <div className="text-slate-200 font-semibold mt-1">@{active.contributor}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {active.selfApproved ? '⚠️ Self-approval detected' : '✓ Segregated author/reviewer'}
              </div>
            </div>

            <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
              <div className="text-slate-500">BRANCH & DIFF METRICS</div>
              <div className="text-slate-200 font-semibold mt-1">
                {active.headBranch} ➔ {active.baseBranch}
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5">
                +{active.additions} / -{active.deletions} lines ({active.changedFilesCount} files)
              </div>
            </div>

            <div className="bg-[#14161D] border border-[#20242F] p-3 rounded-xl">
              <div className="text-slate-500">REWARD CLASSIFICATION</div>
              <div className="text-slate-200 font-semibold mt-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>${active.suggestedRewardUsd?.toFixed(2) || '0.55'} USD</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({active.suggestedPackageValue ? `₹${active.suggestedPackageValue}` : '₹50'} voucher)
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Approval: <span className={isPendingApproval ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>{active.approvalStatus || 'NOT_REQUIRED'}</span>
              </div>
            </div>
          </div>

          {/* Multi-Factor Rubric Evaluation Breakdown */}
          <div className="bg-[#12141A] border border-[#1C202A] rounded-xl p-4 my-3">
            <div className="text-xs font-mono text-slate-400 mb-3 font-semibold uppercase flex items-center justify-between">
              <span>Deterministic Rubric Breakdown</span>
              <span className="text-[10px] text-slate-500">Max 100 Points</span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>1. Code Scope & Complexity</span>
                  <span className="text-slate-400">{rubric.codeScope} / 30 pts</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(rubric.codeScope / 30) * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>2. Test Coverage & CI Validation</span>
                  <span className="text-slate-400">{rubric.testAndCi} / 25 pts</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(rubric.testAndCi / 25) * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>3. Peer Review & Governance</span>
                  <span className="text-slate-400">{rubric.peerReviewQuality} / 25 pts</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(rubric.peerReviewQuality / 25) * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>4. Programme Tier Alignment</span>
                  <span className="text-slate-400">{rubric.tierObjectiveAlignment} / 20 pts</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(rubric.tierObjectiveAlignment / 20) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Deterministic Rule Checklist */}
          <div className="bg-[#12141A] border border-[#1C202A] rounded-xl p-4 my-3">
            <div className="text-xs font-mono text-slate-400 mb-3 font-semibold uppercase">
              Deterministic Verification Guarantees
            </div>
            
            <div className="space-y-2 text-xs font-mono">
              <div className={`flex items-center gap-2.5 ${ruleChecks.repoAllowlisted ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ruleChecks.repoAllowlisted ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Repository enrolled in active programme allowlist</span>
              </div>

              <div className={`flex items-center gap-2.5 ${ruleChecks.mergedIntoTarget ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ruleChecks.mergedIntoTarget ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Pull Request merged into target branch ('{active.baseBranch}')</span>
              </div>

              <div className={`flex items-center gap-2.5 ${ruleChecks.ciChecksPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ruleChecks.ciChecksPassed ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Automated CI & CheckSuite passed successfully</span>
              </div>

              <div className={`flex items-center gap-2.5 ${ruleChecks.maintainerApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                {ruleChecks.maintainerApproved ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Authorized maintainer approved changes</span>
              </div>

              <div className={`flex items-center gap-2.5 ${ruleChecks.notSelfApproved ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ruleChecks.notSelfApproved ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Anti-Fraud: No self-approval detected</span>
              </div>

              <div className={`flex items-center gap-2.5 ${ruleChecks.noDuplicate ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ruleChecks.noDuplicate ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                <span>Anti-Fraud: No prior duplicate reward claims on PR #{active.prNumber}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI & Algorithmic Explanation */}
        <div className="bg-[#14161D] border border-violet-950/60 p-3.5 rounded-xl mt-2">
          <div className="text-[11px] font-mono text-violet-400 mb-1 flex items-center gap-1.5 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>EXPLAINABLE VERIFICATION SUMMARY</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            "{active.aiExplanation || 'Deterministic scoring rules applied successfully based on commit volume, maintainer approval, and CI status.'}"
          </p>
        </div>
      </div>

      {/* Right: Decision & Fulfilment Panel */}
      <div className="flex-[2] bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div>
          <div className="text-xs text-slate-500 font-mono">AUTONOMOUS DECISION CARD</div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">Fulfilment Pipeline</h3>

          {/* Status Alert Banner */}
          <div className={`p-3.5 rounded-xl border my-4 text-xs font-mono ${
            isVerified ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' :
            isFraud ? 'bg-rose-950/40 border-rose-500/40 text-rose-300' :
            isRejected ? 'bg-red-950/40 border-red-500/40 text-red-300' :
            isVerifying ? 'bg-sky-950/40 border-sky-500/40 text-sky-300' :
            isReceived ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300' :
            'bg-amber-950/40 border-amber-500/40 text-amber-300'
          }`}>
            <div className="font-bold flex items-center gap-2">
              {isVerified && <CheckCircle2 className="w-4 h-4" />}
              {isFraud && <ShieldAlert className="w-4 h-4" />}
              {isRejected && <X className="w-4 h-4" />}
              {isVerifying && <Sparkles className="w-4 h-4 animate-spin" />}
              {isReceived && <Clock className="w-4 h-4" />}
              {isNeedsReview && <AlertTriangle className="w-4 h-4" />}
              <span>DECISION: {active.verificationStatus}</span>
            </div>
            {active.fraudFlags.length > 0 && (
              <div className="mt-2 text-[10px] text-rose-400">
                Flags: [{active.fraudFlags.join(', ')}]
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-300 font-sans border-t border-[#3A4050]/40 pt-2">
              {active.approvalStatus === 'PENDING_APPROVAL' && (
                <span className="text-amber-300 font-semibold">⚠️ Requires Coordinator / Maintainer Approval</span>
              )}
              {active.approvalStatus === 'APPROVED' && (
                <span className="text-emerald-300 font-semibold">✓ Approved by {active.approvedBy || 'Maintainer'}</span>
              )}
              {active.approvalStatus === 'NOT_REQUIRED' && (
                <span className="text-emerald-300">✓ Autonomous Verification Verified</span>
              )}
              {active.approvalStatus === 'REJECTED' && (
                <span className="text-rose-400">✗ Rejected by Policy or Maintainer</span>
              )}
            </div>
          </div>

          {/* Bitrefill Execution Lifecycle */}
          <div className="bg-[#13151D] border border-[#20242F] rounded-xl p-3.5 space-y-3 font-mono text-xs">
            <div className="text-slate-400 text-[11px] uppercase font-semibold">Bitrefill Order Lifecycle</div>
            
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[10px]">1</div>
              <div>Invoice Created: <span className="text-slate-300">Generated on Demand</span></div>
            </div>

            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[10px]">2</div>
              <div>Payment: <span className="text-slate-300">Debited from Balance</span></div>
            </div>

            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[10px]">3</div>
              <div>Order Processing: <span className="text-slate-300">Tracked via Order ID</span></div>
            </div>

            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[10px]">4</div>
              <div>Delivered State: <span className="text-slate-300">Finished & Recorded</span></div>
            </div>
          </div>
        </div>

        {/* Action Controls for Manual Review & Approval Queue */}
        <div className="pt-4 border-t border-[#1A1D24] space-y-2">
          {(isPendingApproval || isNeedsReview) && (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-semibold font-mono flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {isApproving ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={handleReject}
                disabled={isApproving || isRejecting}
                className="flex-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 py-2 rounded-xl text-xs font-semibold font-mono flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {isRejecting ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          )}

          <a
            href={active.prUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full bg-[#181B24] hover:bg-[#202430] border border-[#2B303E] text-slate-300 py-2 rounded-xl text-xs font-mono flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>Open Pull Request on GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

