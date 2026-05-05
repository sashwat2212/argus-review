import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonRow } from './Skeleton';
import type { Review } from '../api/types';

type SortKey = 'date' | 'score' | 'status';
type SortDir = 'asc' | 'desc';

interface Props { onSelect: (id: string) => void }

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-gray-600 ml-1">↕</span>;
  return <span className="text-blue-400 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export function ReviewList({ onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(),
    refetchInterval: 10_000,
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...(data?.items ?? [])].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') {
      cmp = (a.started_at ?? '').localeCompare(b.started_at ?? '');
    } else if (sortKey === 'score') {
      cmp = (a.score ?? -1) - (b.score ?? -1);
    } else if (sortKey === 'status') {
      cmp = a.status.localeCompare(b.status);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reviews</h1>
        <p className="text-sm text-gray-400 mt-0.5">All pull request reviews</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-800 rounded-xl text-red-400 text-sm mb-4">
          Failed to load reviews.
        </div>
      )}

      {!isLoading && data?.items.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-lg font-semibold text-white mb-2">No reviews yet</h2>
          <p className="text-sm text-gray-400 mb-4">Set up your GitHub webhook to start receiving automatic code reviews.</p>
          <a href="/docs/self-hosting.md" className="text-blue-400 text-sm hover:underline">View setup guide →</a>
        </div>
      )}

      {(isLoading || (data?.items.length ?? 0) > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] border-b border-gray-800 px-4 py-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pull Request</span>
            <button
              onClick={() => handleSort('status')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
            </button>
            <button
              onClick={() => handleSort('score')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Score <SortIcon active={sortKey === 'score'} dir={sortDir} />
            </button>
            <button
              onClick={() => handleSort('date')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Date <SortIcon active={sortKey === 'date'} dir={sortDir} />
            </button>
          </div>

          <div className="divide-y divide-gray-800">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : sorted.map((review: Review) => (
                  <div
                    key={review.id}
                    onClick={() => onSelect(review.id)}
                    className="px-4 py-3 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">
                            {review.pr_title ?? `PR #${review.pr_number}`}
                          </p>
                          {review.repo_full_name && review.pr_number && (
                            <a
                              href={`https://github.com/${review.repo_full_name}/pull/${review.pr_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline shrink-0"
                            >
                              View PR →
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {review.started_at ? new Date(review.started_at).toLocaleString() : '—'}
                          {' '}· {review.total_findings} finding(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <GitHubStatusBadge status={review.github_comment_status} reviewStatus={review.status} />
                        <StatusBadge status={review.status} />
                        <ScoreBadge score={review.score} />
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {data && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {data.total} total · auto-refreshes every 10s
        </p>
      )}
    </div>
  );
}
