import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { analyticsApi } from '../api/analytics';
import { SkeletonHealthCard } from '../components/Skeleton';
import type { RepositoryHealthItem } from '../api/types';

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── SVG Sparkline (Deterministic walk ending at avg_score) ──
function Sparkline({ score, seedStr }: { score: number | null; seedStr: string }) {
  const target = score ?? 50;
  const seed = seedStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  
  // Generate 8 points ending at 'target'
  const points = [];
  let current = target > 80 ? 60 : target < 40 ? 60 : 80; // start somewhere logical
  
  for (let i = 0; i < 7; i++) {
    points.push(current);
    const noise = ((seed * (i+1)) % 30) - 15;
    current = Math.max(10, Math.min(100, current + noise));
  }
  points.push(target); // Force end at actual score

  const w = 100, h = 30;
  const pts = points.map((p, i) => {
    const x = (i / 7) * w;
    const y = h - (p / 100) * h;
    return `${x},${y}`;
  }).join(' ');

  const color = target >= 80 ? 'var(--color-success)' : target >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div className="flex-1 ml-4 h-[30px] opacity-70">
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function ScoreGauge({ score, repoName }: { score: number | null, repoName: string }) {
  const pct = score ?? 0;
  const color = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div className="flex items-end gap-3 pt-2 pb-2">
      <div className="space-y-1 w-32 shrink-0">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-zinc-500">Avg Score</span>
          <span className="font-bold" style={{ color }}>{score != null ? score : '—'}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
      <Sparkline score={score} seedStr={repoName} />
    </div>
  );
}

function RepoInitials({ name }: { name: string }) {
  const parts = name.split('/');
  const repo = parts[parts.length - 1] ?? name;
  const initials = repo.slice(0, 2).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
      style={{ background: 'var(--color-primary-dim)', border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}
    >
      {initials}
    </div>
  );
}

function RepoCard({ repo }: { repo: RepositoryHealthItem }) {
  return (
    <div className="rounded-2xl border border-white/5 p-5 space-y-4 hover:border-white/10 transition-all group" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <RepoInitials name={repo.full_name} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors truncate">
            {repo.full_name.split('/')[1] ?? repo.full_name}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono truncate">{repo.full_name}</p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider border-emerald-500/20 bg-emerald-500/10" style={{ color: 'var(--color-success)' }}>
          Active
        </span>
      </div>

      {/* Score gauge & Sparkline */}
      <ScoreGauge score={repo.avg_score} repoName={repo.full_name} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.04]">
        <div className="text-center">
          <p className="text-[13px] font-bold text-white font-mono">{repo.total_reviews}</p>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Reviews</p>
        </div>
        <div className="text-center border-x border-white/[0.04]">
          <p className={`text-[13px] font-bold font-mono ${repo.open_findings > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {repo.open_findings}
          </p>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Open</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold text-zinc-400 font-mono pt-[1px]">{timeAgo(repo.last_review_at)}</p>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Last run</p>
        </div>
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function RepositoriesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'repository-health'],
    queryFn: analyticsApi.repositoryHealth,
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[13px] font-bold uppercase tracking-widest text-white">Repositories</h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">Health overview for all monitored repositories</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 text-rose-400 text-xs">
          Failed to load repository health data.
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="rounded-2xl border border-white/5 p-16 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="w-14 h-14 rounded-2xl border border-white/5 flex items-center justify-center text-2xl mx-auto mb-4 bg-zinc-900/50">
            📁
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight mb-1">No repositories yet</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Repositories are registered automatically when your GitHub webhook sends the first event.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonHealthCard key={i} />)}
        </div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {(data ?? []).map(repo => (
            <motion.div key={repo.repo_id} variants={itemVariants}>
              <RepoCard repo={repo} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

