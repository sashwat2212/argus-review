import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { VelocityPoint } from '../api/types';

interface Props { data: VelocityPoint[] }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-mono shadow-xl" style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)' }}>
      <p className="text-slate-400 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-white ml-1">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export function FindingVelocityChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-xs">
        No velocity data yet
      </div>
    );
  }

  // Format date labels to short form
  const formatted = data.map(d => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-opened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-resolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#475569', fontSize: 9, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#475569', fontSize: 9, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#64748b', paddingTop: '8px' }}
          iconSize={8}
          iconType="circle"
        />
        <Area
          type="monotone"
          dataKey="opened"
          name="Opened"
          stroke="#f43f5e"
          strokeWidth={1.5}
          fill="url(#grad-opened)"
          dot={false}
          activeDot={{ r: 3, fill: '#f43f5e' }}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          name="Resolved"
          stroke="#10b981"
          strokeWidth={1.5}
          fill="url(#grad-resolved)"
          dot={false}
          activeDot={{ r: 3, fill: '#10b981' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
