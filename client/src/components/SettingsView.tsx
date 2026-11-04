import React, { useState } from 'react';
import { SystemHealth } from '@shipreward/shared';
import { Settings, ShieldAlert, Key, Globe, Lock, ShieldCheck } from 'lucide-react';

interface SettingsViewProps {
  health?: SystemHealth;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ health }) => {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const webhookUrl = `${window.location.origin}/api/webhooks/github`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col gap-4 w-full">
      <div className="bg-[#0E1014] border border-[#1E222B] rounded-2xl p-5 shadow-xl flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-[#1A1D24]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Engine Settings & Security Guardrails</h2>
            <p className="text-xs text-slate-400">
              Cryptographic webhook verification, server-side secret isolation, and hard expenditure limits.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-xs">
            Security Policy: Enforced
          </span>
        </div>

        {/* Configuration Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* GitHub Webhook Security */}
          <div className="bg-[#13151D] border border-[#202430] p-4 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold uppercase">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>GitHub Webhook Integration</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">PAYLOAD URL (FOR GITHUB REPO SETTINGS)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  className="w-full bg-[#1A1D26] border border-[#2B303E] rounded-xl px-3 py-1.5 text-slate-300 font-mono focus:outline-none"
                />
                <button
                  onClick={handleCopyWebhook}
                  className="px-3 py-1.5 bg-[#232733] hover:bg-[#2C3242] text-slate-200 rounded-xl cursor-pointer"
                >
                  {copiedWebhook ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">CONTENT TYPE</label>
              <input
                type="text"
                value="application/json"
                readOnly
                className="w-full bg-[#1A1D26] border border-[#2B303E] rounded-xl px-3 py-1.5 text-slate-300 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1">HMAC-SHA256 WEBHOOK SECRET</label>
              <input
                type="password"
                value="••••••••••••••••••••••••••••••••"
                readOnly
                className="w-full bg-[#1A1D26] border border-[#2B303E] rounded-xl px-3 py-1.5 text-slate-300 font-mono focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Configured via <code className="text-slate-400">GITHUB_WEBHOOK_SECRET</code> environment variable.
              </span>
            </div>
          </div>

          {/* Bitrefill Integration Security */}
          <div className="bg-[#13151D] border border-[#202430] p-4 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold uppercase">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Bitrefill Commerce Security</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">MCP ENDPOINT</label>
              <input
                type="text"
                value="https://api.bitrefill.com/mcp"
                readOnly
                className="w-full bg-[#1A1D26] border border-[#2B303E] rounded-xl px-3 py-1.5 text-slate-300 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1">API CREDENTIALS (SERVER-SIDE ONLY)</label>
              <input
                type="password"
                value="••••••••••••••••••••••••••••••••"
                readOnly
                className="w-full bg-[#1A1D26] border border-[#2B303E] rounded-xl px-3 py-1.5 text-slate-300 font-mono focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                * API keys and Bearer tokens are never transmitted to or stored in the browser.
              </span>
            </div>

            <div className="pt-2 border-t border-[#1E222C]">
              <div className="text-[11px] text-slate-400 mb-1">VOUCHER PROTECTION POLICY</div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Redemption vouchers and PIN codes are immediately masked with only the last 4 characters retained. Raw vouchers are never logged in plaintext.
              </p>
            </div>
          </div>
        </div>

        {/* Emergency Stop / Killswitch Section */}
        <div className="bg-[#14161E] border border-rose-900/50 rounded-xl p-4 mt-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-lg">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Emergency Purchase Killswitch</h4>
                <p className="text-xs text-slate-400">
                  Instantly block all outgoing Bitrefill purchases across all programmes if unusual activity is detected.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded bg-[#1F232D] text-slate-400 font-mono text-xs border border-[#2C3240]">
              Controlled via <code className="text-slate-300">EMERGENCY_PURCHASE_FREEZE</code>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

