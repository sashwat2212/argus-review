import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { FindingCard } from './FindingCard';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';

interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !data) return <div className="p-8 text-red-500">Failed to load review.</div>;

  const open = data.findings.filter(f => !f.is_resolved);
  const resolved = data.findings.filter(f => f.is_resolved);

  return (
    <div className="p-6">
      <button onClick={onBack} className="text-sm text-blue-400 hover:underline mb-4 block">
        ← Back to reviews
      </button>
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-bold text-white truncate">
          {data.pr_title ?? `PR #${data.pr_number}`}
        </h1>
        <StatusBadge status={data.status} />
        <ScoreBadge score={data.score} />
      </div>
      <p className="text-sm text-gray-400 mb-6">
        {data.total_findings} finding(s) &middot; {data.completed_at ? new Date(data.completed_at).toLocaleString() : 'In progress'}
      </p>

      {open.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Open ({open.length})</h2>
          {open.map(f => <FindingCard key={f.id} finding={f} reviewId={reviewId} />)}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 mt-6 mb-2">Resolved ({resolved.length})</h2>
          {resolved.map(f => <FindingCard key={f.id} finding={f} reviewId={reviewId} />)}
        </>
      )}
      {data.findings.length === 0 && (
        <p className="text-green-400 font-medium">No findings — clean review! 🎉</p>
      )}
    </div>
  );
}
