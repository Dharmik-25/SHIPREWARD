import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  GitPullRequest, 
  ShieldCheck, 
  Gift, 
  ShoppingBag, 
  FileText, 
  Settings, 
  Sparkles
} from 'lucide-react';

export type ScreenId = 
  | 'overview' 
  | 'programmes' 
  | 'contributions' 
  | 'verification' 
  | 'rewards' 
  | 'commerce' 
  | 'audit' 
  | 'settings';

interface SidebarProps {
  currentScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  agentOnline: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentScreen, 
  onSelectScreen,
  agentOnline 
}) => {
  const navItems: Array<{ id: ScreenId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'programmes', label: 'Programmes', icon: <Layers className="w-5 h-5" /> },
    { id: 'contributions', label: 'Contributions', icon: <GitPullRequest className="w-5 h-5" /> },
    { id: 'verification', label: 'Verification & Fraud', icon: <ShieldCheck className="w-5 h-5" /> },
    { id: 'rewards', label: 'Rewards & Fulfilment', icon: <Gift className="w-5 h-5" /> },
    { id: 'commerce', label: 'Bitrefill Commerce', icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'audit', label: 'Audit Trail', icon: <FileText className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings & Caps', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <aside className="w-16 bg-[#0E1014] border border-[#1E222B] rounded-2xl flex flex-col items-center py-4 justify-between shrink-0 shadow-2xl h-[calc(100vh-1.5rem)] sticky top-3">
      {/* Brand Logo */}
      <div className="flex flex-col items-center gap-6">
        <button 
          onClick={() => onSelectScreen('overview')}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:border-emerald-400 transition-all cursor-pointer"
          title="SHIPREWARD"
        >
          ▲
        </button>

        {/* Navigation Icon Stack */}
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectScreen(item.id)}
                title={item.label}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                  isActive
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#181B22]'
                }`}
              >
                {item.icon}
                {/* Floating tooltip */}
                <span className="absolute left-16 ml-2 bg-[#181B22] border border-[#2B303E] text-slate-200 text-xs px-2 py-1 rounded-md shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status Indicator */}
      <div className="flex flex-col items-center gap-3">
        <div 
          className={`w-2.5 h-2.5 rounded-full ${agentOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-amber-400'}`} 
          title={agentOnline ? 'Autonomous Agent: Online' : 'Agent Degraded'}
        />
        <div className="w-8 h-8 rounded-lg bg-[#181B22] border border-[#262A35] flex items-center justify-center text-[10px] text-slate-400 font-mono">
          MCP
        </div>
      </div>
    </aside>
  );
};
