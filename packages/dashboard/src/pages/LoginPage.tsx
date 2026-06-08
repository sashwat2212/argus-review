import { useEffect, useState } from 'react';

const BOOT_LOGS = [
  '» [BOOT] Initializing Argus core static analysis engine v1.2.0...',
  '» [OK] PostgreSQL pipeline handshake verified.',
  '» [OK] Celery cluster synchronizing thread pool [8 workers online].',
  '» [OK] Quality agent system compiled [Confidence rating target: 0.50].',
  '» [OK] Security agent system compiled [Severity weights mapped].',
  '» [OK] Synthesis agent deduplication engine primed.',
  '» [READY] Multi-agent collaboration loop online.',
  '» [AWAITING] Authorizing incoming system gateway connection...'
];

export function LoginPage() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const timer = async () => {
      for (let i = 0; i < BOOT_LOGS.length; i++) {
        if (!active) break;
        await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
        setLogs(prev => [...prev, BOOT_LOGS[i]]);
      }
    };
    timer();
    return () => { active = false; };
  }, []);

  const handleGitHubLogin = () => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    window.location.href = `${apiBase}/api/v1/auth/github/login`;
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern flex items-center justify-center p-6 relative overflow-hidden bg-slate-radial">
      {/* Dynamic Background Radial Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse-soft" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse-soft" />

      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center relative z-10">
        {/* Left Panel: High-fidelity authorization gateway */}
        <div className="glass-panel rounded-2xl p-8 shadow-2xl border border-white/5 relative overflow-hidden glow-violet backdrop-blur-xl">
          {/* Active scanning laser line */}
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-60 animate-scan-line pointer-events-none" />
          
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              🔍
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                Argus <span className="text-[10px] font-mono py-0.5 px-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-widest font-normal">v2.0.0</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Automated Code Quality & Security Gate</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 text-sm text-slate-300 leading-relaxed">
              Welcome to the new Argus Console. To proceed, please authenticate with your GitHub account. 
              This will create your personal workspace.
            </div>

            <button
              onClick={handleGitHubLogin}
              className="w-full bg-[#24292e] hover:bg-[#2f363d] text-white text-sm font-semibold py-3.5 rounded-xl transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] active:scale-[0.98] flex items-center justify-center gap-3 border border-white/10"
            >
              <svg height="20" viewBox="0 0 16 16" version="1.1" width="20" aria-hidden="true" fill="currentColor">
                <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              Continue with GitHub
            </button>
          </div>

          <div className="mt-8 pt-5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Authentication Requirement</span>
            <code className="text-slate-400 font-mono">OAuth 2.0</code>
          </div>
        </div>

        {/* Right Panel: Beautiful interactive terminal logs bootstrap */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-slate-950/60 h-[340px] flex flex-col font-mono text-[11px] text-slate-400 shadow-2xl relative overflow-hidden hidden md:flex glow-cyan backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
              <span className="text-[10px] text-slate-500 ml-2">system-diagnostics.log</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 uppercase tracking-wider animate-pulse-soft">Live Diagnostic</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-thin scrollbar-thumb-white/5">
            {logs.map((log, index) => (
              <p
                key={index}
                className={`${
                  log.includes('[OK]')
                    ? 'text-cyan-400'
                    : log.includes('[READY]')
                    ? 'text-emerald-400 font-semibold'
                    : log.includes('[AWAITING]')
                    ? 'text-indigo-400'
                    : 'text-slate-300'
                }`}
              >
                {log}
              </p>
            ))}
            {logs.length < BOOT_LOGS.length && (
              <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-pulse ml-0.5" />
            )}
          </div>

          <div className="border-t border-white/5 pt-3 mt-4 flex items-center justify-between text-[10px] text-slate-500">
            <span>Uptime: 0.00h</span>
            <span>Network: Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

