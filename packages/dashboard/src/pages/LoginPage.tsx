import { useEffect, useState } from 'react';
import { api, setStoredApiKey } from '../api/client';

interface Props { onSuccess: () => void }

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

export function LoginPage({ onSuccess }: Props) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await api.verifyKey(key.trim());
      if (ok) {
        setStoredApiKey(key.trim());
        onSuccess();
      } else {
        setError('Invalid API key. Check your ARGUS_API_KEY in .env.');
      }
    } catch {
      setError('Could not reach the Argus API. Is it running?');
    } finally {
      setLoading(false);
    }
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
                Argus <span className="text-[10px] font-mono py-0.5 px-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-widest font-normal">v1.2.0</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Automated Code Quality & Security Gate</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">API Key Signature</label>
              <div className="relative">
                <input
                  type="password"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="argus-dev-key-..."
                  className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono shadow-inner"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-lg animate-pulse-soft">
                <span>⚠️</span>
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-sm font-semibold py-3 rounded-xl transition-all shadow-[0_4px_15px_rgba(99,102,241,0.2)] active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Verifying signature...
                </div>
              ) : (
                'Establish Connection'
              )}
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Authentication Requirement</span>
            <code className="text-slate-400 font-mono">ARGUS_API_KEY</code>
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

