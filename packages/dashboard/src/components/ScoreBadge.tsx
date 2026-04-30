interface Props { score: number | null }

export function ScoreBadge({ score }: Props) {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>;
  const color =
    score >= 80 ? 'bg-green-500/10 text-green-400' :
    score >= 60 ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-red-500/10 text-red-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}/100
    </span>
  );
}
