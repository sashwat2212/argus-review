import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { SeverityDonutChart } from '../components/SeverityDonutChart';
import { StatCard } from '../components/StatCard';
import { TopCategoriesChart } from '../components/TopCategoriesChart';
import { SkeletonCard } from '../components/Skeleton';

export function DashboardPage() {
  const overview   = useQuery({ queryKey: ['analytics', 'overview'],   queryFn: analyticsApi.overview,              refetchInterval: 30_000 });
  const trend      = useQuery({ queryKey: ['analytics', 'trend'],      queryFn: () => analyticsApi.scoreTrend(30) });
  const severity   = useQuery({ queryKey: ['analytics', 'severity'],   queryFn: analyticsApi.severityBreakdown });
  const categories = useQuery({ queryKey: ['analytics', 'categories'], queryFn: analyticsApi.topCategories });

  const stats = overview.data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Overview of all code reviews and findings</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Reviews"
              value={stats?.total_reviews ?? '—'}
              sub={`${stats?.completed_reviews ?? 0} completed`}
              icon="📋"
              color="blue"
            />
            <StatCard
              label="Avg Score"
              value={stats?.avg_score != null ? `${stats.avg_score}` : '—'}
              sub="out of 100"
              icon="⭐"
              color={stats?.avg_score != null ? (stats.avg_score >= 80 ? 'green' : stats.avg_score >= 60 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.avg_score != null ? (stats.avg_score >= 70 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Pass Rate"
              value={stats?.pass_rate != null ? `${Math.round(stats.pass_rate * 100)}%` : '—'}
              sub="score ≥ 70"
              icon="✅"
              color={stats?.pass_rate != null ? (stats.pass_rate >= 0.8 ? 'green' : stats.pass_rate >= 0.5 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.pass_rate != null ? (stats.pass_rate >= 0.7 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Open Findings"
              value={stats?.open_findings ?? '—'}
              sub={`of ${stats?.total_findings ?? 0} total`}
              icon="⚠️"
              color={stats?.open_findings != null ? (stats.open_findings === 0 ? 'green' : stats.open_findings < 10 ? 'yellow' : 'red') : 'blue'}
            />
          </>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Score Trend</h2>
        {trend.isLoading
          ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
          : <ScoreTrendChart data={trend.data ?? []} />
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Open Findings by Severity</h2>
          {severity.isLoading
            ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
            : <SeverityDonutChart data={severity.data ?? []} />
          }
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Issue Categories</h2>
          {categories.isLoading
            ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
            : <TopCategoriesChart data={categories.data ?? []} />
          }
        </div>
      </div>
    </div>
  );
}
