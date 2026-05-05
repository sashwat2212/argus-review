import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonFinding } from './Skeleton';
import { useToast } from '../hooks/useToast';
import { DiffPanel } from './DiffPanel';
import type { Finding } from '../api/types';

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  useEffect(() => {
    if (data && data.findings.length > 0 && !selectedFinding) {
      setSelectedFinding(data.findings[0]);
    }
  }, [data]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await api.retryReview(reviewId);
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Re-review queued');
      onBack();
    } catch {
      toast.error('Failed to queue re-review');
    } finally {
      setRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-sm text-blue-400 hover:underline mb-4 block">← Back to reviews</button>
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonFinding key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-red-400">Failed to load review.</div>;
  }

  const canRetry = data.status === 'completed' || data.status === 'failed';
  const displayFinding = selectedFinding ?? data.findings[0] ?? null;

  return (
    <div className="p-6 h-full flex flex-col">
      <button onClick={onBack} className="text-sm text-blue-400 hover:underline mb-4 block">
        ← Back to reviews
      </button>

      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="text-xl font-bold text-white truncate">
            {data.pr_title ?? `PR #${data.pr_number}`}
          </h1>
          <StatusBadge status={data.status} />
          <ScoreBadge score={data.score} />
          <GitHubStatusBadge status={data.github_comment_status} reviewStatus={data.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.repo_full_name && data.pr_number && (
            <a
              href={`https://github.com/${data.repo_full_name}/pull/${data.pr_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              View PR →
            </a>
          )}
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            >
              {retrying ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
                  Queuing…
                </>
              ) : (
                '↺ Re-review'
              )}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        {data.total_findings} finding(s) · {data.completed_at ? new Date(data.completed_at).toLocaleString() : 'In progress'}
      </p>

      {data.findings.length === 0 && (
        <p className="text-green-400 font-medium">No findings — clean review! 🎉</p>
      )}

      {data.findings.length > 0 && (
        <div className="flex gap-3 flex-1 min-h-0 lg:flex-row flex-col">
          {/* Panel 1 — findings list */}
          <div className="lg:w-1/4 overflow-y-auto space-y-1 pr-1 shrink-0">
            {data.findings.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFinding(f)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  displayFinding?.id === f.id
                    ? 'bg-blue-600/20 border border-blue-600/40'
                    : 'hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{SEVERITY_ICON[f.severity] ?? '⚪'}</span>
                  <span className={`text-xs font-medium truncate ${f.is_resolved ? 'line-through text-gray-500' : 'text-white'}`}>
                    {f.title}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate pl-6">{f.file_path}:{f.line_start}</p>
              </button>
            ))}
          </div>

          {/* Panel 2 — diff viewer */}
          <div className="lg:w-1/2 overflow-y-auto border border-gray-800 rounded-lg min-h-0">
            <DiffPanel rawDiff={data.raw_diff} finding={displayFinding} />
          </div>

          {/* Panel 3 — finding detail */}
          <div className="lg:w-1/4 overflow-y-auto shrink-0">
            {displayFinding ? (
              <FindingDetail finding={displayFinding} reviewId={reviewId} />
            ) : (
              <div className="text-gray-500 text-sm p-4">Select a finding to see details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FindingDetail({ finding, reviewId }: { finding: Finding; reviewId: string }) {
  const queryClient = useQueryClient();

  async function resolve() {
    await api.resolveFinding(reviewId, finding.id);
    await queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
  }

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/10 border-red-800 text-red-400',
    high:     'bg-orange-500/10 border-orange-800 text-orange-400',
    medium:   'bg-yellow-500/10 border-yellow-800 text-yellow-400',
    low:      'bg-blue-500/10 border-blue-800 text-blue-400',
    info:     'bg-gray-500/10 border-gray-700 text-gray-400',
  };

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${severityColors[finding.severity] ?? severityColors.info}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span>{SEVERITY_ICON[finding.severity] ?? '⚪'}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{finding.severity}</span>
            <span className="text-xs text-gray-500">·</span>
            <span className="text-xs text-gray-500">{finding.category}</span>
          </div>
          <h3 className="text-sm font-semibold text-white">{finding.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{finding.file_path}:{finding.line_start}–{finding.line_end}</p>
        </div>
        {!finding.is_resolved ? (
          <button
            onClick={resolve}
            className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            Resolve
          </button>
        ) : (
          <span className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400">✓ Resolved</span>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm text-gray-300">{finding.description}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Why it matters</p>
        <p className="text-sm text-gray-300">{finding.why_it_matters}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Suggested fix</p>
        <pre className="text-xs bg-gray-950 rounded-lg p-3 text-gray-300 whitespace-pre-wrap overflow-x-auto">{finding.suggested_fix}</pre>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-700/50">
        <span>Agent: {finding.agent}</span>
        <span>·</span>
        <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
      </div>
    </div>
  );
}
