import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  running:   'bg-cyan-500 animate-pulse',
  pending:   'bg-amber-500 animate-pulse',
  failed:    'bg-rose-500',
};

const SCORE_COLOR = (s: number | null) => {
  if (s === null) return 'text-slate-500';
  if (s >= 80)   return 'text-emerald-400';
  if (s >= 60)   return 'text-amber-400';
  return 'text-rose-400';
};

export function RecentActivityFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ['reviews', 'recent'],
    queryFn: () => api.listReviews(1, 6),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-1.5">
      {isLoading && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-2.5">
          <div className="skeleton w-2 h-2 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-40 rounded" />
            <div className="skeleton h-2.5 w-24 rounded" />
          </div>
          <div className="skeleton h-3 w-8 rounded" />
        </div>
      ))}

      {(data?.items ?? []).map(r => (
        <div
          key={r.id}
          className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group cursor-default"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[r.status] ?? 'bg-slate-600'}`}
            style={r.status === 'running' || r.status === 'pending' ? { boxShadow: '0 0 6px currentColor' } : {}}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate group-hover:text-white transition-colors">
              {r.pr_title ?? `PR #${r.pr_number}`}
            </p>
            <p className="text-[10px] text-slate-500 font-mono truncate">
              {r.repo_full_name ?? '—'} · {timeAgo(r.started_at)}
            </p>
          </div>
          {r.score !== null ? (
            <span className={`text-xs font-bold font-mono shrink-0 ${SCORE_COLOR(r.score)}`}>
              {r.score}
            </span>
          ) : (
            <span className="text-[10px] text-slate-600 font-mono shrink-0 uppercase tracking-wider">
              {r.status}
            </span>
          )}
        </div>
      ))}

      {!isLoading && !data?.items.length && (
        <p className="text-center text-slate-600 text-xs py-6">No recent reviews</p>
      )}
    </div>
  );
}
