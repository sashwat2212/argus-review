import { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { CommandPalette } from '../components/CommandPalette';

interface Props { children: React.ReactNode; onLogout: () => void }

export function AppShell({ children, onLogout }: Props) {
  const [uptime, setUptime] = useState(0);
  const [utcTime, setUtcTime] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);

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

  // ⌘K / Ctrl+K global keybind
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdOpen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const NAV = [
    { to: '/',             icon: '▦',  label: 'Dashboard',    count: null as number | null },
    { to: '/reviews',      icon: '⊡',  label: 'Reviews',      count: overview?.total_reviews ?? null },
    { to: '/repositories', icon: '⊟',  label: 'Repositories', count: null as number | null },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)', color: '#f1f5f9' }}>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r flex flex-col z-20" style={{ borderColor: 'var(--color-border)', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(24px)' }}>
        {/* Logo */}
        <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold text-indigo-400" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
            A
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-white leading-none">Argus</p>
            <p className="text-[9px] text-slate-500 font-mono tracking-widest mt-0.5">REVIEW v2</p>
          </div>
        </div>

        {/* Search / ⌘K trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="mx-3 mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 border transition-all hover:border-white/10 hover:text-slate-300"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.02)' }}
        >
          <span className="text-[11px]">⌘</span>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[9px] font-mono bg-slate-800/80 border border-white/5 px-1 py-0.5 rounded text-slate-500">K</kbd>
        </button>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon, label, count }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
                    : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-white/[0.025]'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className="font-mono text-[10px] rounded-full px-2 py-0.5 text-slate-500" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wider text-slate-500 border border-transparent hover:border-rose-500/20 hover:text-rose-400 hover:bg-rose-500/5 w-full transition-all"
          >
            <span>↪</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden relative" style={{ background: 'var(--color-bg)' }}>
        {/* Subtle ambient glows */}
        <div className="absolute top-0 right-0 w-[600px] h-[400px] rounded-full blur-[180px] pointer-events-none" style={{ background: 'rgba(99,102,241,0.025)' }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[160px] pointer-events-none" style={{ background: 'rgba(139,92,246,0.02)' }} />

        {/* Top bar */}
        <header className="h-11 border-b flex items-center justify-between px-6 shrink-0 select-none z-10" style={{ borderColor: 'var(--color-border)', background: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center gap-5 text-[9px] tracking-widest font-mono text-slate-500 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: '0 0 6px #10b981' }} />
              Engine active
            </span>
            <span className="hidden sm:inline">Claude-3.5-Sonnet</span>
            <span className="hidden lg:inline">CELERY_NODE_0</span>
          </div>
          <div className="flex items-center gap-5 text-[9px] tracking-widest font-mono text-slate-500 uppercase">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/5 hover:border-white/10 hover:text-slate-300 transition-all"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <span>⌘K</span>
            </button>
            <span className="hidden md:inline">UTC {utcTime}</span>
            <span>↑ {formatUptime(uptime)}</span>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
