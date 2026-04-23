import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Finding } from '../api/types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 bg-red-500/10',
  high:     'border-orange-400 bg-orange-400/10',
  medium:   'border-yellow-400 bg-yellow-400/10',
  low:      'border-blue-400 bg-blue-400/10',
  info:     'border-gray-600 bg-gray-800',
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
};

interface Props {
  finding: Finding;
  reviewId: string;
}

export function FindingCard({ finding, reviewId }: Props) {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: () => api.resolveFinding(reviewId, finding.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
    },
  });

  return (
    <div className={`border-l-4 rounded p-4 mb-3 ${SEVERITY_COLORS[finding.severity] ?? 'border-gray-600 bg-gray-800'} ${finding.is_resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {SEVERITY_EMOJI[finding.severity]} [{finding.severity.toUpperCase()}] {finding.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {finding.file_path}:{finding.line_start}–{finding.line_end} &middot; {finding.category}
          </p>
          <p className="text-sm text-gray-300 mt-2">{finding.description}</p>
          {finding.why_it_matters && (
            <p className="text-xs text-gray-400 mt-1"><strong>Why it matters:</strong> {finding.why_it_matters}</p>
          )}
          {finding.suggested_fix && (
            <p className="text-xs text-gray-400 mt-1"><strong>Fix:</strong> {finding.suggested_fix}</p>
          )}
        </div>
        {!finding.is_resolved && (
          <button
            onClick={() => resolve.mutate()}
            disabled={resolve.isPending}
            className="shrink-0 text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 disabled:opacity-50"
          >
            {resolve.isPending ? '…' : 'Resolve'}
          </button>
        )}
        {finding.is_resolved && (
          <span className="shrink-0 text-xs text-green-400 font-medium">✓ Resolved</span>
        )}
      </div>
    </div>
  );
}
