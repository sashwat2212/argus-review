import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { analyticsApi } from '../api/analytics';
import { CommandPalette } from '../components/CommandPalette';

interface Props { children: React.ReactNode; onLogout: () => void }

export function AppShell({ children, onLogout }: Props) {
  const [uptime, setUptime] = useState(0);
  const [utcTime, setUtcTime] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();

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

  // Global keybinds
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdOpen(prev => !prev);
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target === document.body) {
      e.preventDefault();
      setHelpOpen(prev => !prev);
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
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)', color: '#e4e4e7' }}>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      
      {/* Shortcuts Modal */}
      <AnimatePresence>
        {helpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="cmd-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setHelpOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
              style={{ background: 'var(--color-surface)' }}
            >
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                <span className="text-cyan-400">⌨</span> Keyboard Shortcuts
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Command Palette</span>
                  <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[10px]">⌘ K</kbd>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Next Finding</span>
                  <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[10px]">j</kbd>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Prev Finding</span>
                  <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[10px]">k</kbd>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Quick Resolve</span>
                  <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[10px]">r</kbd>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Toggle Shortcuts</span>
                  <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[10px]">?</kbd>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r flex flex-col z-20" style={{ borderColor: 'var(--color-border)', background: 'rgba(24,24,27,0.4)', backdropFilter: 'blur(24px)' }}>
        {/* Logo */}
        <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'var(--color-primary-dim)', border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
            A
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-white leading-none">Argus</p>
            <p className="text-[9px] font-mono tracking-widest mt-0.5" style={{ color: 'var(--color-primary)' }}>SAAS EDITION</p>
          </div>
        </div>

        {/* Search / ⌘K trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="mx-3 mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-500 border transition-all hover:border-white/10 hover:text-zinc-300"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.02)' }}
        >
          <span className="text-[11px]">⌘</span>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[9px] font-mono bg-zinc-800/80 border border-white/5 px-1 py-0.5 rounded text-zinc-500">K</kbd>
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
                    ? 'border text-white'
                    : 'text-zinc-400 border border-transparent hover:text-zinc-200 hover:bg-white/[0.025]'
                }`
              }
              style={({ isActive }) => isActive ? { background: 'var(--color-primary-dim)', borderColor: 'var(--color-primary)' } : {}}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className="font-mono text-[10px] rounded-full px-2 py-0.5 text-zinc-500" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
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
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border border-transparent hover:border-red-500/20 hover:text-red-400 hover:bg-red-500/5 w-full transition-all"
          >
            <span>↪</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Subtle ambient glows matching the 2-color theme */}
        <div className="absolute top-0 right-0 w-[600px] h-[400px] rounded-full blur-[180px] pointer-events-none" style={{ background: 'var(--color-primary-dim)' }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[160px] pointer-events-none" style={{ background: 'var(--color-accent-dim)' }} />

        {/* Top bar */}
        <header className="h-11 border-b flex items-center justify-between px-6 shrink-0 select-none z-10" style={{ borderColor: 'var(--color-border)', background: 'rgba(9,9,11,0.6)', backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center gap-5 text-[9px] tracking-widest font-mono text-zinc-500 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-success)', boxShadow: '0 0 6px var(--color-success)' }} />
              Engine active
            </span>
            <span className="hidden sm:inline">Claude-3.5-Sonnet</span>
          </div>
          <div className="flex items-center gap-5 text-[9px] tracking-widest font-mono text-zinc-500 uppercase">
            <button
              onClick={() => setHelpOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/5 hover:border-white/10 hover:text-zinc-300 transition-all"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <span>? Help</span>
            </button>
            <span className="hidden md:inline">UTC {utcTime}</span>
            <span>↑ {formatUptime(uptime)}</span>
          </div>
        </header>

        {/* Page content with Page Transitions */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
