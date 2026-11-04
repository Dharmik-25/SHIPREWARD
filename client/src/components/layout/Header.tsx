import React from 'react';
import { Zap, ChevronDown, ShieldAlert } from 'lucide-react';
import { SystemHealth } from '@shipreward/shared';

interface HeaderProps {
  onOpenSimulation: () => void;
  health?: SystemHealth;
  selectedProgram: string;
  onSelectProgram: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSimulation,
  health,
  selectedProgram,
  onSelectProgram,
}) => {
  const dailySpent = health?.bitrefill?.spentTodayUsd ?? 0;
  const dailyCap = health?.bitrefill?.dailySpendCapUsd ?? 25;
  const spendPercent = Math.min(100, (dailySpent / dailyCap) * 100);
  const isEmergencyFreeze = health?.bitrefill?.emergencyFreeze ?? false;

  return (
    <header className="h-14 bg-[#0E1014] border border-[#1E222B] rounded-2xl px-4 flex items-center justify-between shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        {/* Quick Action Button */}
        <button
          onClick={onOpenSimulation}
          className="bg-[#EA580C] hover:bg-[#D94F04] text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-orange-950/40 transition-all cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>⚡ Trigger Test Contribution</span>
        </button>

        {/* Programme Scope Selector */}
        <div className="relative">
          <select
            value={selectedProgram}
            onChange={(e) => onSelectProgram(e.target.value)}
            className="appearance-none bg-[#15171D] border border-[#232733] pl-3 pr-8 py-1.5 rounded-xl text-xs text-slate-300 font-medium focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            <option value="ALL">Scope: All Programmes (Campus + Builder + Enterprise)</option>
            <option value="prog_builder_core">Builder: Open-Source Engine Core</option>
            <option value="prog_campus_cs401">Campus: CS401 Distributed Systems</option>
            <option value="prog_enterprise_infra">Enterprise: Fintech Platform Org</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Live Agent Status Pill */}
        <div className="hidden md:flex items-center gap-1.5 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded-lg text-xs text-emerald-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Agent: Webhook Listening
        </div>

        {isEmergencyFreeze && (
          <div className="flex items-center gap-1.5 bg-rose-950/40 border border-rose-800/60 px-2.5 py-1 rounded-lg text-xs text-rose-400 font-mono">
            <ShieldAlert className="w-3.5 h-3.5" />
            FREEZE ACTIVE
          </div>
        )}
      </div>

      {/* Right Guardrails and Profile */}
      <div className="flex items-center gap-4">
        {/* Daily Cap Progress */}
        <div className="text-right hidden sm:block">
          <div className="text-[11px] text-slate-400 font-mono">
            Daily Live Spend: <span className="text-slate-200 font-bold">${dailySpent.toFixed(2)} / ${dailyCap.toFixed(2)}</span>
          </div>
          <div className="w-32 h-1.5 bg-[#1F232D] rounded-full overflow-hidden mt-1">
            <div 
              className={`h-full transition-all duration-500 ${spendPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${spendPercent}%` }}
            />
          </div>
        </div>

        <div className="h-6 w-px bg-[#232733]" />

        {/* User Badge */}
        <div className="flex items-center gap-2 bg-[#15171D] border border-[#232733] pl-1.5 pr-3 py-1 rounded-xl">
          <div className="w-6 h-6 rounded-lg bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold text-xs">
            SR
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-slate-200 leading-tight">Lead Admin</div>
            <div className="text-[10px] text-slate-500 font-mono leading-tight">SHIPREWARD Engine</div>
          </div>
        </div>
      </div>
    </header>
  );
};

