import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';

interface Props { children: React.ReactNode; onLogout: () => void }

export function AppShell({ children, onLogout }: Props) {
  const [uptime, setUptime] = useState(0);
  const [utcTime, setUtcTime] = useState('');

  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: analyticsApi.overview,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    setUtcTime(new Date().toUTCString().replace('GMT', 'UTC'));
    const timer = setInterval(() => {
      setUptime(prev => prev + 1);
      setUtcTime(new Date().toUTCString().replace('GMT', 'UTC'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const NAV = [
    { to: '/',             icon: '📊', label: 'Dashboard',    count: null as number | null },
    { to: '/reviews',      icon: '🔍', label: 'Reviews',      count: overview?.total_reviews ?? null },
    { to: '/repositories', icon: '📁', label: 'Repositories', count: null as number | null },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sleek Minimal Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-950/40 border-r border-white/5 flex flex-col backdrop-blur-xl z-20">
        <div className="px-6 py-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-base shadow-[0_0_12px_rgba(99,102,241,0.15)]">
              🔍
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Argus</p>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider">REVIEW SYSTEM</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1.5">
          {NAV.map(({ to, icon, label, count }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold shadow-inner shadow-indigo-500/5'
                    : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-white/[0.02]'
                }`
              }
            >
              <span className="text-sm">{icon}</span>
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className="bg-slate-900 border border-white/5 text-slate-400 font-mono text-[10px] rounded-full px-2.5 py-0.5">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider text-slate-400 border border-transparent hover:border-rose-500/20 hover:text-rose-400 hover:bg-rose-500/5 w-full transition-all"
          >
            <span>🚪</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 bg-grid-pattern relative bg-slate-radial">
        {/* Dynamic Background Radial Accents */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-500/[0.02] rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-violet-500/[0.02] rounded-full blur-[160px] pointer-events-none" />

        {/* Live Top Telemetry Header Bar */}
        <header className="h-12 border-b border-white/5 bg-slate-950/20 backdrop-blur-md flex items-center justify-between px-6 z-10 shrink-0 select-none">
          <div className="flex items-center gap-6 text-[9px] tracking-widest font-mono text-slate-500 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              Engine: Active
            </span>
            <span className="hidden sm:inline">Model: Claude-3.5-Sonnet</span>
            <span className="hidden lg:inline">Node: CELERY_NODE_0</span>
          </div>
          <div className="flex items-center gap-6 text-[9px] tracking-widest font-mono text-slate-500 uppercase">
            <span className="hidden md:inline">UTC: {utcTime}</span>
            <span>Uptime: {formatUptime(uptime)}</span>
          </div>
        </header>

        {/* Subpage Router Outlet Container */}
        <div className="flex-1 overflow-y-auto relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}

