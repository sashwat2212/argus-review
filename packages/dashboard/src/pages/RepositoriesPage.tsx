import { useQuery } from '@tanstack/react-query';
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

function ScoreGauge({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color = pct >= 80 ? 'var(--color-emerald)' : pct >= 60 ? 'var(--color-amber)' : 'var(--color-rose)';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-500">Avg Score</span>
        <span className="font-bold" style={{ color }}>{score != null ? score : '—'}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function RepoInitials({ name }: { name: string }) {
  const parts = name.split('/');
  const repo = parts[parts.length - 1] ?? name;
  const initials = repo.slice(0, 2).toUpperCase();
  // Stable color from name
  const colors = ['#6366f1', '#22d3ee', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899'];
  const hue = colors[repo.charCodeAt(0) % colors.length];
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
      style={{ background: `${hue}22`, border: `1px solid ${hue}40`, color: hue }}
    >
      {initials}
    </div>
  );
}

function RepoCard({ repo }: { repo: RepositoryHealthItem }) {
  return (
    <div className="rounded-2xl border border-white/5 p-5 space-y-4 hover:border-white/10 transition-all group" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <RepoInitials name={repo.full_name} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
            {repo.full_name.split('/')[1] ?? repo.full_name}
          </p>
          <p className="text-[10px] text-slate-500 font-mono truncate">{repo.full_name}</p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider text-emerald-400 border-emerald-500/20 bg-emerald-950/20 shrink-0">
          Active
        </span>
      </div>

      {/* Score gauge */}
      <ScoreGauge score={repo.avg_score} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.04]">
        <div className="text-center">
          <p className="text-sm font-bold text-white font-mono">{repo.total_reviews}</p>
          <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Reviews</p>
        </div>
        <div className="text-center border-x border-white/[0.04]">
          <p className={`text-sm font-bold font-mono ${repo.open_findings > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {repo.open_findings}
          </p>
          <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Open</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold text-slate-400 font-mono">{timeAgo(repo.last_review_at)}</p>
          <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Last run</p>
        </div>
      </div>
    </div>
  );
}

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
        <p className="text-[11px] text-slate-500 mt-0.5">Health overview for all monitored repositories</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 text-rose-400 text-xs">
          Failed to load repository health data.
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="rounded-2xl border border-white/5 p-16 text-center" style={{ background: 'rgba(15,23,42,0.3)' }}>
          <div className="w-14 h-14 rounded-2xl border border-white/5 flex items-center justify-center text-2xl mx-auto mb-4">
            📁
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight mb-1">No repositories yet</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Repositories are registered automatically when your GitHub webhook sends the first event.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonHealthCard key={i} />)
          : (data ?? []).map(repo => <RepoCard key={repo.repo_id} repo={repo} />)
        }
      </div>
    </div>
  );
}
