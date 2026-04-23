interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const BG: Record<Props['color'], string> = {
  blue:   'bg-blue-500/10 border-blue-500/20',
  green:  'bg-green-500/10 border-green-500/20',
  yellow: 'bg-yellow-500/10 border-yellow-500/20',
  red:    'bg-red-500/10 border-red-500/20',
  purple: 'bg-purple-500/10 border-purple-500/20',
};

const ICON_BG: Record<Props['color'], string> = {
  blue:   'bg-blue-500/20 text-blue-400',
  green:  'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  red:    'bg-red-500/20 text-red-400',
  purple: 'bg-purple-500/20 text-purple-400',
};

const TREND_ICON = { up: '↑', down: '↓', neutral: '→' };
const TREND_COLOR = { up: 'text-green-400', down: 'text-red-400', neutral: 'text-gray-400' };

export function StatCard({ label, value, sub, icon, trend, color }: Props) {
  return (
    <div className={`rounded-xl border p-5 ${BG[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          {sub && (
            <p className={`text-xs mt-1 ${trend ? TREND_COLOR[trend] : 'text-gray-500'}`}>
              {trend && <span className="mr-1">{TREND_ICON[trend]}</span>}
              {sub}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${ICON_BG[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
