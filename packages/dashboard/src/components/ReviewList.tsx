import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { SkeletonCard } from './Skeleton';
import type { Review } from '../api/types';

type StatusFilter = 'all' | 'pending' | 'running' | 'completed' | 'failed';

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  high:     'bg-amber-500/15 text-amber-400 border-amber-500/20',
  medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  low:      'bg-sky-500/15 text-sky-400 border-sky-500/20',
  info:     'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

function ScoreRing({ score }: { score: number | null }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct  = score != null ? score / 100 : 0;
  const dash = circ * pct;
  const color = score == null ? '#334155' : score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90 absolute inset-0">
        <circle cx="22" cy="22" r={r} className="score-ring-track" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} className="score-ring-fill" strokeWidth="3" stroke={color} strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <span className="text-[10px] font-bold font-mono relative z-10" style={{ color }}>
        {score != null ? score : '—'}
      </span>
    </div>
  );
}

function SeverityChips({ findings }: { findings: Review['findings'] }) {
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  const ordered = ['critical', 'high', 'medium', 'low'].filter(s => counts[s]);
  if (!ordered.length) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ordered.map(s => (
        <span key={s} className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEVERITY_COLOR[s]}`}>
          {counts[s]} {s[0]}
        </span>
      ))}
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Pending',   value: 'pending' },
  { label: 'Running',   value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed',    value: 'failed' },
];

interface Props { onSelect: (id: string) => void }

export function ReviewList({ onSelect }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(1, 50),
    refetchInterval: 10_000,
  });

  const items = (data?.items ?? []).filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-widest text-white">Reviews</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {data ? `${data.total} total · refreshes every 10s` : 'Pull request code reviews'}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 pb-px">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${
              filter === f.value
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {f.label}
            {f.value !== 'all' && data && (
              <span className="ml-1.5 text-[9px] font-mono text-slate-600">
                {data.items.filter(r => r.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 text-rose-400 text-xs">
          Failed to load reviews.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="rounded-2xl border border-white/5 p-16 text-center" style={{ background: 'rgba(15,23,42,0.3)' }}>
          <div className="w-14 h-14 rounded-2xl border border-white/5 flex items-center justify-center text-2xl mx-auto mb-4">
            🔍
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight mb-1">
            {filter === 'all' ? 'No reviews yet' : `No ${filter} reviews`}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {filter === 'all'
              ? 'Set up your GitHub webhook to start receiving automatic code reviews.'
              : 'Try a different filter to see other reviews.'}
          </p>
        </div>
      )}

      {/* Cards grid */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      <div className="space-y-2">
        {items.map((review, i) => (
          <button
            key={review.id}
            onClick={() => onSelect(review.id)}
            className="w-full text-left rounded-xl border border-white/5 p-4 flex items-center gap-4 hover:border-white/10 hover:bg-white/[0.015] transition-all group animate-slide-up"
            style={{ background: 'rgba(15,23,42,0.35)', animationDelay: `${i * 30}ms` }}
          >
            {/* Score ring */}
            <ScoreRing score={review.score} />

            {/* Main info */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate leading-tight">
                {review.pr_title ?? `PR #${review.pr_number}`}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {review.repo_full_name && (
                  <span className="text-[10px] text-slate-500 font-mono">{review.repo_full_name}</span>
                )}
                <span className="text-[10px] text-slate-600 font-mono">{timeAgo(review.started_at)}</span>
                <SeverityChips findings={review.findings} />
              </div>
            </div>

            {/* Right badges */}
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={review.status} />
              {review.repo_full_name && review.pr_number && (
                <a
                  href={`https://github.com/${review.repo_full_name}/pull/${review.pr_number}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] font-mono text-slate-600 hover:text-slate-300 border border-white/5 px-2 py-1 rounded-lg hover:border-white/10 transition-all"
                >
                  ↗ PR
                </a>
              )}
              <span className="text-slate-600 text-sm group-hover:text-slate-400 transition-colors">›</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
