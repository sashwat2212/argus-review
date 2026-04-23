import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import type { Review } from '../api/types';

interface Props { onSelect: (id: string) => void }

export function ReviewList({ onSelect }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(),
    refetchInterval: 10_000,
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !data) return <div className="p-8 text-red-500">Failed to load reviews.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>
      {data.items.length === 0 && (
        <p className="text-gray-500">No reviews yet. Open a PR to trigger one.</p>
      )}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white shadow-sm">
        {data.items.map((review: Review) => (
          <button
            key={review.id}
            onClick={() => onSelect(review.id)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {review.pr_title ?? `PR #${review.pr_number}`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {review.started_at ? new Date(review.started_at).toLocaleString() : '—'}
                {' '}· {review.total_findings} finding(s)
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={review.status} />
              <ScoreBadge score={review.score} />
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-right">
        {data.total} total · auto-refreshes every 10s
      </p>
    </div>
  );
}
