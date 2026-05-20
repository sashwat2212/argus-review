import { useRef, useState } from 'react';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const ACCENT_BAR: Record<Props['color'], string> = {
  blue:   'bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)]',
  green:  'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
  yellow: 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
  red:    'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]',
  purple: 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)]',
};

const GLOW_ACCENT: Record<Props['color'], string> = {
  blue:   'glow-cyan',
  green:  'glow-emerald',
  yellow: 'glow-rose', // warm Amber alert
  red:    'glow-rose',
  purple: 'glow-violet',
};

const TREND_ICON = { up: '↑', down: '↓', neutral: '→' };
const TREND_COLOR = { up: 'text-emerald-400', down: 'text-rose-400', neutral: 'text-slate-500' };

export function StatCard({ label, value, sub, icon, trend, color }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Relative mouse coordinate coordinates (from -0.5 to 0.5)
    const mouseX = (e.clientX - rect.left) / width - 0.5;
    const mouseY = (e.clientY - rect.top) / height - 0.5;
    
    // Max rotation is 8 degrees for smooth micro-tilt
    const maxRot = 8;
    setRotate({
      x: -mouseY * maxRot,
      y: mouseX * maxRot,
    });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div className="perspective-1000">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
        }}
        className={`glass-panel rounded-2xl p-6 shadow-xl border border-white/5 relative overflow-hidden transform-3d-card group cursor-default select-none ${GLOW_ACCENT[color]}`}
      >
        {/* Top edge neon indicator gauge */}
        <div className={`absolute top-0 inset-x-0 h-[2px] w-full ${ACCENT_BAR[color]}`} />
        
        {/* Inner glare overlay effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] to-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
            <p className="text-3xl font-extrabold tracking-tight text-white font-mono">{value}</p>
            {sub && (
              <p className={`text-[11px] font-medium flex items-center gap-1 ${trend ? TREND_COLOR[trend] : 'text-slate-400'}`}>
                {trend && <span className="text-xs font-bold">{TREND_ICON[trend]}</span>}
                <span>{sub}</span>
              </p>
            )}
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-center text-base shadow-inner text-slate-300 group-hover:scale-105 group-hover:text-white transition-all duration-300">
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}

