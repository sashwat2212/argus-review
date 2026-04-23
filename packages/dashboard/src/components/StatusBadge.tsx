import type { ReviewStatus } from '../api/types';

interface Props { status: ReviewStatus }

const COLORS: Record<ReviewStatus, string> = {
  pending:   'bg-gray-100 text-gray-700',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLORS[status]}`}>
      {status}
    </span>
  );
}
