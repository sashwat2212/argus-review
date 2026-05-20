type GHStatus = 'success' | 'failed' | 'skipped' | 'pending' | null | undefined;

interface Props {
  status: GHStatus;
  reviewStatus?: string;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: '✅ Commented',  className: 'bg-green-500/10 text-green-400' },
  failed:  { label: '❌ Failed',     className: 'bg-red-500/10 text-red-400' },
  skipped: { label: '⏭ Skipped',    className: 'bg-gray-500/10 text-gray-500' },
  pending: { label: '⏳ Pending',    className: 'bg-gray-500/10 text-gray-400' },
};

export function GitHubStatusBadge({ status, reviewStatus }: Props) {
  if (reviewStatus && !['completed', 'failed'].includes(reviewStatus)) return null;

  const key = status ?? 'pending';
  const cfg = CONFIG[key] ?? CONFIG.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
