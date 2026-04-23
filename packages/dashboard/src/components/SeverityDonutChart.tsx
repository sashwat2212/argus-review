import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SeverityCount } from '../api/types';

interface Props { data: SeverityCount[] }

const COLORS: Record<string, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#3B82F6', info: '#6B7280',
};

export function SeverityDonutChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-500 text-sm">No open findings</div>;
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="severity" cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2}>
            {data.map(d => <Cell key={d.severity} fill={COLORS[d.severity] ?? '#6B7280'} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} itemStyle={{ color: '#E5E7EB', fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span style={{ color: '#9CA3AF', fontSize: 12 }}>{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center mt-[-20px]">
          <p className="text-2xl font-bold text-white">{total}</p>
          <p className="text-xs text-gray-400">open</p>
        </div>
      </div>
    </div>
  );
}
