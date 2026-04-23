import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ScorePoint } from '../api/types';

interface Props { data: ScorePoint[] }

export function ScoreTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No completed reviews yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#E5E7EB', fontSize: 12 }}
          itemStyle={{ color: '#60A5FA' }}
          formatter={(val: number) => [`${val}/100`, 'Score']}
        />
        <ReferenceLine y={70} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'Pass', fill: '#F59E0B', fontSize: 10 }} />
        <Line type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} activeDot={{ r: 5, fill: '#60A5FA' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
