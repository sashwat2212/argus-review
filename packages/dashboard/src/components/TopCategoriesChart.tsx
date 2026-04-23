import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CategoryCount } from '../api/types';

interface Props { data: CategoryCount[] }

const BAR_COLORS = ['#3B82F6','#8B5CF6','#06B6D4','#10B981','#F59E0B','#EF4444','#EC4899','#F97316','#84CC16','#6B7280'];

export function TopCategoriesChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-500 text-sm">No findings yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="category" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
        <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} itemStyle={{ color: '#E5E7EB', fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
