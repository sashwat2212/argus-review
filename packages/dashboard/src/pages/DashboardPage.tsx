import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { SeverityDonutChart } from '../components/SeverityDonutChart';
import { StatCard } from '../components/StatCard';
import { TopCategoriesChart } from '../components/TopCategoriesChart';
import { SkeletonCard } from '../components/Skeleton';
import { AgentNetwork } from '../components/AgentNetwork';

export function DashboardPage() {
  const overview   = useQuery({ queryKey: ['analytics', 'overview'],   queryFn: analyticsApi.overview,              refetchInterval: 30_000 });
  const trend      = useQuery({ queryKey: ['analytics', 'trend'],      queryFn: () => analyticsApi.scoreTrend(30) });
  const severity   = useQuery({ queryKey: ['analytics', 'severity'],   queryFn: analyticsApi.severityBreakdown });
  const categories = useQuery({ queryKey: ['analytics', 'categories'], queryFn: analyticsApi.topCategories });

  const stats = overview.data;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Sleek Workspace Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white uppercase font-mono">Workspace Console</h1>
          <p className="text-xs text-slate-400 mt-0.5">Overview of active code review metrics, AI agent statuses, and vulnerability indexes</p>
        </div>
        <div className="text-[9px] font-mono text-slate-400 bg-slate-950 border border-white/5 px-3 py-1.5 rounded-xl shrink-0 uppercase tracking-widest hidden sm:inline-block shadow-inner">
          SYS_SEC_GATE: SYNCD
        </div>
      </div>

      {/* Top 3D StatCards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Reviews Audit"
              value={stats?.total_reviews ?? '—'}
              sub={`${stats?.completed_reviews ?? 0} successfully compiled`}
              icon="📋"
              color="blue"
            />
            <StatCard
              label="Avg Audit Score"
              value={stats?.avg_score != null ? `${stats.avg_score}` : '—'}
              sub="quality rating out of 100"
              icon="⭐"
              color={stats?.avg_score != null ? (stats.avg_score >= 80 ? 'green' : stats.avg_score >= 60 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.avg_score != null ? (stats.avg_score >= 70 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Code Pass Rate"
              value={stats?.pass_rate != null ? `${Math.round(stats.pass_rate * 100)}%` : '—'}
              sub="score standard threshold ≥ 70"
              icon="✅"
              color={stats?.pass_rate != null ? (stats.pass_rate >= 0.8 ? 'green' : stats.pass_rate >= 0.5 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.pass_rate != null ? (stats.pass_rate >= 0.7 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Open Vulnerabilities"
              value={stats?.open_findings ?? '—'}
              sub={`active threats out of ${stats?.total_findings ?? 0} total`}
              icon="⚠️"
              color={stats?.open_findings != null ? (stats.open_findings === 0 ? 'green' : stats.open_findings < 10 ? 'yellow' : 'red') : 'blue'}
            />
          </>
        )}
      </div>

      {/* Center Grid: Interactive AgentNetwork Split with Score Trend Rechart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-stretch">
          <AgentNetwork />
        </div>
        
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 border border-white/5 relative overflow-hidden bg-slate-950/20 backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4 shrink-0">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Historical Score Trend</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Rolling average rating across 30 days</p>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 uppercase tracking-widest font-mono">
              Score Timeline
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            {trend.isLoading ? (
              <div className="h-56 w-full animate-pulse bg-slate-900/40 rounded-xl border border-white/5" />
            ) : (
              <div className="w-full h-full min-h-[220px]">
                <ScoreTrendChart data={trend.data ?? []} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Severity Breakdowns next to Category Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-6 border border-white/5 relative overflow-hidden bg-slate-950/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Findings by Severity</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Breakdown of vulnerabilities indexed by threat level</p>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 uppercase tracking-widest font-mono">
              Risk Profile
            </span>
          </div>
          {severity.isLoading ? (
            <div className="h-[220px] animate-pulse bg-slate-900/40 rounded-xl border border-white/5" />
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <SeverityDonutChart data={severity.data ?? []} />
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-white/5 relative overflow-hidden bg-slate-950/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Top Issue Categories</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Audit findings grouped by specific category metrics</p>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase tracking-widest font-mono">
              Focus Areas
            </span>
          </div>
          {categories.isLoading ? (
            <div className="h-[220px] animate-pulse bg-slate-900/40 rounded-xl border border-white/5" />
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <TopCategoriesChart data={categories.data ?? []} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

