interface Props { score: number | null }

export function ScoreBadge({ score }: Props) {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>;
  const color =
    score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}/100
    </span>
  );
}
