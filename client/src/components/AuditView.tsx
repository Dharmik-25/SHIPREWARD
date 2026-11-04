import React from 'react';
import { AuditEvent } from '@shipreward/shared';
import { FileText, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface AuditViewProps {
  auditLogs: AuditEvent[];
}

export const AuditView: React.FC<AuditViewProps> = ({ auditLogs }) => {
  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Immutable Audit Trail & Ledger</h2>
            <p className="text-xs text-slate-400">
              Chronological cryptographic evidence of webhook verifications, deterministic policy scoring, and commerce actions.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-400">
            Total Ledger Entries: <span className="text-slate-200 font-bold">{auditLogs.length}</span>
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1">
          {auditLogs.map((log) => {
            const isAuthorized = log.decision === 'AUTHORIZED' || log.decision === 'PROCESSED';
            const isRejected = log.decision === 'REJECTED';
            const isReview = log.decision === 'REVIEW_REQUIRED';

            return (
              <div 
                key={log.id}
                className="bg-[#13151C] border border-[#1E222C] rounded-xl p-3 flex items-start justify-between text-xs font-mono"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] border font-bold ${
                      isAuthorized ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' :
                      isRejected ? 'bg-rose-950/60 border-rose-500/40 text-rose-400' :
                      'bg-amber-950/60 border-amber-500/40 text-amber-400'
                    }`}>
                      {log.eventType}
                    </span>
                    <span className="text-slate-500 text-[10px]">actor: {log.actor}</span>
                  </div>

                  <p className="text-slate-200 font-sans text-xs pt-0.5">
                    {log.details}
                  </p>
                </div>

                <div className="text-right shrink-0 ml-4">
                  <span className={`font-bold ${
                    isAuthorized ? 'text-emerald-400' :
                    isRejected ? 'text-rose-400' :
                    'text-amber-400'
                  }`}>
                    {log.decision}
                  </span>
                  {log.costUsd && log.costUsd > 0 ? (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      -${log.costUsd.toFixed(2)} USD
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-[#1A1D24] text-[11px] font-mono text-slate-500 flex justify-between items-center">
          <span>Non-repudiation: Events are logged synchronously before external actions occur.</span>
          <span className="text-emerald-400">Tamper Evident</span>
        </div>
      </div>
    </div>
  );
};
