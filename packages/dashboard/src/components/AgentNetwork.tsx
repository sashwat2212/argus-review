import { useState } from 'react';

interface AgentDetails {
  name: string;
  role: string;
  description: string;
  icon: string;
  checks: string[];
  colorClass: string;
  glowColor: string;
}

const AGENTS: Record<'quality' | 'security' | 'synthesis', AgentDetails> = {
  quality: {
    name: 'Quality Agent',
    role: 'Structure & Style Audit',
    description: 'Inspects architectural health, function sizing, complexity matrices, and maintainability scores.',
    icon: '📊',
    checks: ['Cognitive Complexity Analysis', 'Dead Code & Redundancy Detection', 'Error Handling Auditing', 'Style & PEP8 Alignment'],
    colorClass: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/20',
    glowColor: 'rgba(6, 182, 212, 0.4)'
  },
  security: {
    name: 'Security Agent',
    role: 'Vulnerability Detection',
    description: 'Scans for credentials, exposed secrets, SQL/NoSQL injection channels, and OWASP Top 10 breaches.',
    icon: '🛡️',
    checks: ['Automated Secret Scanning', 'Input Sanitization Audits', 'OWASP Top 10 Vulnerabilities', 'Dependency Risk Scoring'],
    colorClass: 'text-rose-400 border-rose-500/30 bg-rose-950/20',
    glowColor: 'rgba(244, 63, 94, 0.4)'
  },
  synthesis: {
    name: 'Synthesis Agent',
    role: 'Reports Consolidation',
    description: 'De-duplicates logs, compiles multi-engine findings, and maps prioritized refactoring suggestions.',
    icon: '🧠',
    checks: ['Findings Deduplication', 'Report Synthesis Engine', 'Fix Priority Allocation', 'Git Diff Mapping'],
    colorClass: 'text-indigo-400 border-indigo-500/30 bg-indigo-950/20',
    glowColor: 'rgba(139, 92, 246, 0.4)'
  }
};

export function AgentNetwork() {
  const [activeAgent, setActiveAgent] = useState<'quality' | 'security' | 'synthesis' | null>(null);

  return (
    <div className="glass-panel rounded-2xl border border-white/5 p-6 shadow-2xl relative overflow-hidden bg-slate-950/20 backdrop-blur-xl h-[380px] flex flex-col justify-between">
      {/* Top Header info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3 relative z-10 shrink-0">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">LangGraph Synthesis Pipeline</h3>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Engine nodes collaborative status</p>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-widest font-mono animate-pulse-soft">
          Active Sync
        </span>
      </div>

      {/* Main interactive visualization block */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6 relative py-4">
        {/* Left Side: SVG Network Graph */}
        <div className="relative w-56 h-56 flex-shrink-0 flex items-center justify-center">
          {/* Outer rotating decorative rings */}
          <div className="absolute inset-0 rounded-full border border-dashed border-slate-800 animate-rotate-slow pointer-events-none" />
          <div className="absolute inset-4 rounded-full border border-slate-900 animate-rotate-slow-reverse pointer-events-none" />
          
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="stream-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            {/* Connecting flow paths */}
            <path
              d="M 100,50 L 150,136 L 50,136 Z"
              fill="none"
              stroke="url(#stream-grad)"
              strokeWidth="1.5"
              className="opacity-40"
            />
            {/* Animated data particles circulating paths */}
            <circle r="2.5" fill="#06b6d4" className="shadow-[0_0_8px_#06b6d4]">
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                path="M 100,50 L 150,136 L 50,136 Z"
              />
            </circle>
            <circle r="2" fill="#f43f5e" className="shadow-[0_0_8px_#f43f5e]">
              <animateMotion
                dur="6s"
                repeatCount="indefinite"
                path="M 150,136 L 50,136 L 100,50 Z"
              />
            </circle>
          </svg>

          {/* Interactive Agent Node buttons */}
          {/* Node 1: Synthesis Agent (Top Center) */}
          <button
            onMouseEnter={() => setActiveAgent('synthesis')}
            onMouseLeave={() => setActiveAgent(null)}
            className={`absolute top-2 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 text-lg shadow-lg hover:scale-110 ${
              activeAgent === 'synthesis'
                ? 'border-indigo-500 bg-indigo-950/30 scale-105 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                : 'border-white/5 bg-slate-950'
            }`}
          >
            🧠
          </button>

          {/* Node 2: Quality Agent (Bottom Left) */}
          <button
            onMouseEnter={() => setActiveAgent('quality')}
            onMouseLeave={() => setActiveAgent(null)}
            className={`absolute bottom-4 left-6 w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 text-lg shadow-lg hover:scale-110 ${
              activeAgent === 'quality'
                ? 'border-cyan-500 bg-cyan-950/30 scale-105 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'border-white/5 bg-slate-950'
            }`}
          >
            📊
          </button>

          {/* Node 3: Security Agent (Bottom Right) */}
          <button
            onMouseEnter={() => setActiveAgent('security')}
            onMouseLeave={() => setActiveAgent(null)}
            className={`absolute bottom-4 right-6 w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 text-lg shadow-lg hover:scale-110 ${
              activeAgent === 'security'
                ? 'border-rose-500 bg-rose-950/30 scale-105 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                : 'border-white/5 bg-slate-950'
            }`}
          >
            🛡️
          </button>

          {/* Center core pulse */}
          <div className="w-8 h-8 rounded-full border border-indigo-500/20 bg-slate-950/50 flex items-center justify-center text-xs text-indigo-400 font-mono shadow-[0_0_12px_rgba(99,102,241,0.15)] animate-pulse pointer-events-none">
            AI
          </div>
        </div>

        {/* Right Side: Active Telemetry Info Overlay Sheet */}
        <div className="flex-1 w-full h-[220px] relative">
          {activeAgent ? (
            <div className="absolute inset-0 flex flex-col justify-center space-y-3 animate-pulse-soft">
              <div className="flex items-center gap-2">
                <span className="text-xl">{AGENTS[activeAgent].icon}</span>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-tight">{AGENTS[activeAgent].name}</h4>
                  <p className="text-[10px] text-indigo-400 font-mono uppercase tracking-wider">{AGENTS[activeAgent].role}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{AGENTS[activeAgent].description}</p>
              
              <div className="space-y-1.5 pt-1.5">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Active Audit Checks</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {AGENTS[activeAgent].checks.map((check, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px] text-slate-300 font-mono truncate">
                      <span className="w-1 h-1 rounded-full bg-indigo-500" />
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <div className="w-10 h-10 rounded-full border border-dashed border-slate-800 flex items-center justify-center mb-3 text-slate-600">
                ✨
              </div>
              <p className="text-xs font-semibold text-slate-400">Collaborative Agent Pipeline</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-[220px]">
                Hover over the network nodes to inspect the specialized tasks performed by each agent.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-white/5 pt-3 flex items-center justify-between text-[9px] text-slate-500 font-mono relative z-10 shrink-0">
        <span>Engine Orchestrator Status: STABLE</span>
        <span>Thread Pool: 8/8 Tasks</span>
      </div>
    </div>
  );
}
