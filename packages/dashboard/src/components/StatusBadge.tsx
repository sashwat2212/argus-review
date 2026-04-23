import type { ReviewStatus } from '../api/types';

interface Props { status: ReviewStatus }

const COLORS: Record<ReviewStatus, string> = {
  pending:   'bg-gray-500/10 text-gray-400',
  running:   'bg-blue-500/10 text-blue-400',
  completed: 'bg-green-500/10 text-green-400',
  failed:    'bg-red-500/10 text-red-400',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLORS[status]}`}>
      {status}
    </span>
  );
}
