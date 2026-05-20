import { useState } from 'react';
import type { AgentBreakdownItem } from '../api/types';

interface AgentMeta {
  icon: string;
  label: string;
  key: string;
  checks: string[];
  color: string;
  glow: string;
  ringColor: string;
}

const AGENTS: AgentMeta[] = [
  {
    icon: '🧠', label: 'Synthesis', key: 'synthesis_agent',
    checks: ['Findings Deduplication', 'Report Consolidation', 'Priority Allocation', 'Git Diff Mapping'],
    color: 'border-violet-500/30 bg-violet-950/10', glow: '0 0 20px rgba(139,92,246,0.25)', ringColor: '#8b5cf6',
  },
  {
    icon: '📊', label: 'Quality', key: 'quality_agent',
    checks: ['Cognitive Complexity', 'Dead Code Detection', 'Error Handling', 'Style Alignment'],
    color: 'border-cyan-500/30 bg-cyan-950/10', glow: '0 0 20px rgba(34,211,238,0.25)', ringColor: '#22d3ee',
  },
  {
    icon: '🛡️', label: 'Security', key: 'security_agent',
    checks: ['Secret Scanning', 'Input Sanitization', 'OWASP Top 10', 'Dependency Risk'],
    color: 'border-rose-500/30 bg-rose-950/10', glow: '0 0 20px rgba(244,63,94,0.25)', ringColor: '#f43f5e',
  },
];

interface Props {
  agentData?: AgentBreakdownItem[];
}

function ScoreRing({ rate, color }: { rate: number; color: string }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = circ * rate;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
      <circle cx="20" cy="20" r={r} className="score-ring-track" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r}
        className="score-ring-fill"
        strokeWidth="3"
        stroke={color}
        strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  );
}

export function AgentNetwork({ agentData }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const getStats = (key: string): { total: number; resolution_rate: number } => {
    const d = agentData?.find(a => a.agent === key);
    return d ? { total: d.total, resolution_rate: d.resolution_rate } : { total: 0, resolution_rate: 0 };
  };

  const activeMeta = AGENTS.find(a => a.key === active);
  const activeStats = active ? getStats(active) : null;

  return (
    <div className="rounded-2xl border border-white/5 flex flex-col overflow-hidden" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(12px)', minHeight: '340px' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">LangGraph Agent Pipeline</h3>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Live node resolution metrics</p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest font-mono border text-indigo-400 border-indigo-500/20 bg-indigo-950/20 animate-pulse">
          Synced
        </span>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-center gap-4 p-5">
        {/* Left: visual node cluster */}
        <div className="relative w-52 h-52 flex-shrink-0 flex items-center justify-center">
          {/* Rotating rings */}
          <div className="absolute inset-0 rounded-full border border-dashed border-white/[0.04] animate-spin" style={{ animationDuration: '20s' }} />
          <div className="absolute inset-5 rounded-full border border-white/[0.02] animate-spin" style={{ animationDuration: '30s', animationDirection: 'reverse' }} />

          {/* SVG connector paths */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 200">
            <path d="M 100,44 L 152,138 L 48,138 Z" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <circle r="2.5" fill="var(--color-cyan)" opacity="0.8">
              <animateMotion dur="4s" repeatCount="indefinite" path="M 100,44 L 152,138 L 48,138 Z" />
            </circle>
            <circle r="2" fill="var(--color-rose)" opacity="0.7">
              <animateMotion dur="6.5s" repeatCount="indefinite" path="M 152,138 L 48,138 L 100,44 Z" />
            </circle>
            <circle r="1.5" fill="var(--color-violet)" opacity="0.6">
              <animateMotion dur="9s" repeatCount="indefinite" path="M 48,138 L 100,44 L 152,138 Z" />
            </circle>
          </svg>

          {/* Top node — Synthesis */}
          <button
            onMouseEnter={() => setActive('synthesis_agent')}
            onMouseLeave={() => setActive(null)}
            className={`absolute top-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border flex items-center justify-center text-lg transition-all duration-200 hover:scale-110 ${active === 'synthesis_agent' ? 'border-violet-500/50 bg-violet-950/30 scale-110' : 'border-white/8 bg-slate-950'}`}
            style={{ boxShadow: active === 'synthesis_agent' ? '0 0 18px rgba(139,92,246,0.4)' : undefined }}
          >
            🧠
          </button>

          {/* Bottom-left — Quality */}
          <button
            onMouseEnter={() => setActive('quality_agent')}
            onMouseLeave={() => setActive(null)}
            className={`absolute bottom-6 left-4 w-12 h-12 rounded-full border flex items-center justify-center text-lg transition-all duration-200 hover:scale-110 ${active === 'quality_agent' ? 'border-cyan-500/50 bg-cyan-950/30 scale-110' : 'border-white/8 bg-slate-950'}`}
            style={{ boxShadow: active === 'quality_agent' ? '0 0 18px rgba(34,211,238,0.4)' : undefined }}
          >
            📊
          </button>

          {/* Bottom-right — Security */}
          <button
            onMouseEnter={() => setActive('security_agent')}
            onMouseLeave={() => setActive(null)}
            className={`absolute bottom-6 right-4 w-12 h-12 rounded-full border flex items-center justify-center text-lg transition-all duration-200 hover:scale-110 ${active === 'security_agent' ? 'border-rose-500/50 bg-rose-950/30 scale-110' : 'border-white/8 bg-slate-950'}`}
            style={{ boxShadow: active === 'security_agent' ? '0 0 18px rgba(244,63,94,0.4)' : undefined }}
          >
            🛡️
          </button>

          {/* Center AI core */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold font-mono text-indigo-400 border border-indigo-500/20 animate-pulse pointer-events-none" style={{ background: 'rgba(99,102,241,0.08)', boxShadow: '0 0 16px rgba(99,102,241,0.15)' }}>
            AI
          </div>
        </div>

        {/* Right: detail pane */}
        <div className="flex-1 w-full min-h-[180px] relative">
          {activeMeta && activeStats ? (
            <div className="space-y-3 animate-slide-up">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{activeMeta.icon}</span>
                <div>
                  <h4 className="text-sm font-bold text-white">{activeMeta.label} Agent</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-slate-400">{activeStats.total} findings</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-[10px] font-mono text-emerald-400">{Math.round(activeStats.resolution_rate * 100)}% resolved</span>
                  </div>
                </div>
                <div className="ml-auto">
                  <ScoreRing rate={activeStats.resolution_rate} color={AGENTS.find(a => a.key === active)?.ringColor ?? '#6366f1'} />
                </div>
              </div>

              <div>
                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Audit Checks</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {activeMeta.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                      <span className="w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full border border-dashed border-white/[0.06] flex items-center justify-center text-slate-700 mb-3">
                ✦
              </div>
              <p className="text-xs font-medium text-slate-500">Hover an agent node</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[180px]">
                Inspect live resolution rates and audit checks
              </p>
              {agentData && agentData.length > 0 && (
                <div className="mt-4 flex gap-4">
                  {agentData.slice(0, 3).map(a => (
                    <div key={a.agent} className="text-center">
                      <p className="text-[10px] font-mono text-slate-400">{a.total}</p>
                      <p className="text-[9px] text-slate-600 uppercase tracking-wider">{a.agent.replace('_agent', '')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/[0.04] px-5 py-2.5 flex items-center justify-between text-[9px] font-mono text-slate-600 shrink-0">
        <span>Orchestrator: STABLE</span>
        <span>3 nodes · Celery thread pool</span>
      </div>
    </div>
  );
}
