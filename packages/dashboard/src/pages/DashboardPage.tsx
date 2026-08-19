import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { analyticsApi } from '../api/analytics';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { SeverityDonutChart } from '../components/SeverityDonutChart';
import { StatCard } from '../components/StatCard';
import { AgentNetwork } from '../components/AgentNetwork';
import { FindingVelocityChart } from '../components/FindingVelocityChart';
import { RecentActivityFeed } from '../components/RecentActivityFeed';
import { SkeletonCard } from '../components/Skeleton';

function Panel({ title, sub, badge, badgeColor, children, className = '' }: {
  title: string; sub?: string; badge?: string;
  badgeColor?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/5 flex flex-col overflow-hidden ${className}`} style={{ background: 'var(--color-surface)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">{title}</h3>
          {sub && <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{sub}</p>}
        </div>
        {badge && (
          <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest font-mono border ${badgeColor ?? 'text-zinc-400 border-zinc-700 bg-zinc-900/40'}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="flex-1 p-5 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
};

export function DashboardPage() {
  const overview    = useQuery({ queryKey: ['analytics', 'overview'],      queryFn: analyticsApi.overview,          refetchInterval: 30_000 });
  const trend       = useQuery({ queryKey: ['analytics', 'trend'],         queryFn: () => analyticsApi.scoreTrend(30) });
  const severity    = useQuery({ queryKey: ['analytics', 'severity'],      queryFn: analyticsApi.severityBreakdown });
  const velocity    = useQuery({ queryKey: ['analytics', 'velocity'],      queryFn: () => analyticsApi.findingVelocity(14) });
  const agentData   = useQuery({ queryKey: ['analytics', 'agent'],         queryFn: analyticsApi.agentBreakdown });
  const duration    = useQuery({ queryKey: ['analytics', 'duration'],      queryFn: analyticsApi.reviewDuration });

  const stats = overview.data;

  const avgDuration = duration.data?.avg_seconds
    ? duration.data.avg_seconds < 60
      ? `${Math.round(duration.data.avg_seconds)}s`
      : `${(duration.data.avg_seconds / 60).toFixed(1)}m`
    : '—';

  return (
    <div className="p-6 space-y-5 max-w-[1700px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-widest text-white">Workspace Console</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Live analytics across all review agents and repositories</p>
        </div>
        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest hidden sm:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-5"
      >
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {overview.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <motion.div variants={itemVariants} className="h-full"><StatCard label="Total Reviews"    value={stats?.total_reviews ?? '—'}  sub={`${stats?.completed_reviews ?? 0} completed`}                    icon="📋" color="blue" /></motion.div>
              <motion.div variants={itemVariants} className="h-full"><StatCard label="Avg Score"        value={stats?.avg_score != null ? `${stats.avg_score}` : '—'} sub="quality index"                          icon="⭐" color={stats?.avg_score != null ? (stats.avg_score >= 80 ? 'green' : stats.avg_score >= 60 ? 'yellow' : 'red') : 'blue'} trend={stats?.avg_score != null ? (stats.avg_score >= 70 ? 'up' : 'down') : undefined} /></motion.div>
              <motion.div variants={itemVariants} className="h-full"><StatCard label="Pass Rate"        value={stats?.pass_rate != null ? `${Math.round(stats.pass_rate * 100)}%` : '—'} sub="score ≥ 70"         icon="✅" color={stats?.pass_rate != null ? (stats.pass_rate >= 0.8 ? 'green' : stats.pass_rate >= 0.5 ? 'yellow' : 'red') : 'blue'} trend={stats?.pass_rate != null ? (stats.pass_rate >= 0.7 ? 'up' : 'down') : undefined} /></motion.div>
              <motion.div variants={itemVariants} className="h-full"><StatCard label="Open Findings"    value={stats?.open_findings ?? '—'}  sub={`of ${stats?.total_findings ?? 0} total`}                        icon="⚠️" color={stats?.open_findings != null ? (stats.open_findings === 0 ? 'green' : stats.open_findings < 10 ? 'yellow' : 'red') : 'blue'} /></motion.div>
              <motion.div variants={itemVariants} className="h-full"><StatCard label="Avg Review Time"  value={avgDuration}                   sub={duration.data ? `min ${duration.data.min_seconds != null ? Math.round(duration.data.min_seconds) : '—'}s` : 'pipeline speed'} icon="⚡" color="purple" /></motion.div>
            </>
          )}
        </div>

        {/* Center row: AgentNetwork + Finding Velocity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <motion.div variants={itemVariants} className="lg:col-span-5 h-full">
            <AgentNetwork agentData={agentData.data} />
          </motion.div>
          <motion.div variants={itemVariants} className="lg:col-span-7 h-full">
            <Panel title="Finding Velocity" sub="Opened vs resolved · last 14 days" badge="Live" badgeColor="text-emerald-400 border-emerald-500/20 bg-emerald-950/20" className="h-full min-h-[340px]">
              {velocity.isLoading ? (
                <div className="h-full skeleton rounded-xl" />
              ) : (
                <div className="h-56">
                  <FindingVelocityChart data={velocity.data ?? []} />
                </div>
              )}
            </Panel>
          </motion.div>
        </div>

        {/* Bottom row: Severity + Score Trend + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <motion.div variants={itemVariants} className="lg:col-span-4 h-full">
            <Panel title="Severity Breakdown" sub="Open findings by threat level" badge="Risk" badgeColor="text-rose-400 border-rose-500/20 bg-rose-950/20" className="h-full">
              {severity.isLoading ? (
                <div className="h-48 skeleton rounded-xl" />
              ) : (
                <div className="h-48">
                  <SeverityDonutChart data={severity.data ?? []} />
                </div>
              )}
            </Panel>
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-5 h-full">
            <Panel title="Score Trend" sub="Rolling 30-review average" badge="Timeline" badgeColor="text-[color:var(--color-primary)] border-[color:var(--color-primary)] bg-[color:var(--color-primary-dim)]" className="h-full">
              {trend.isLoading ? (
                <div className="h-48 skeleton rounded-xl" />
              ) : (
                <div className="h-48">
                  <ScoreTrendChart data={trend.data ?? []} />
                </div>
              )}
            </Panel>
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-3 h-full">
            <Panel title="Recent Reviews" sub="Live feed · auto-refreshes 10s" badge="Feed" badgeColor="text-[color:var(--color-accent)] border-[color:var(--color-accent)] bg-zinc-900/40" className="h-full">
              <RecentActivityFeed />
            </Panel>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

