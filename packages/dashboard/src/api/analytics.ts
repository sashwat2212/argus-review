import type {
  AgentBreakdownItem,
  CategoryCount,
  OverviewStats,
  RepositoryHealthItem,
  ReviewDurationStats,
  ScoreDistributionItem,
  ScorePoint,
  SeverityCount,
  TopFileItem,
  VelocityPoint,
} from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

function authHeader(): Record<string, string> {
  const key = localStorage.getItem('argus_api_key');
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export const analyticsApi = {
  overview:            () => get<OverviewStats>('/api/v1/analytics/overview'),
  scoreTrend:          (limit = 30) => get<ScorePoint[]>(`/api/v1/analytics/score-trend?limit=${limit}`),
  severityBreakdown:   () => get<SeverityCount[]>('/api/v1/analytics/severity-breakdown'),
  topCategories:       () => get<CategoryCount[]>('/api/v1/analytics/top-categories'),
  // v2 endpoints
  repositoryHealth:    () => get<RepositoryHealthItem[]>('/api/v1/analytics/repository-health'),
  agentBreakdown:      () => get<AgentBreakdownItem[]>('/api/v1/analytics/agent-breakdown'),
  findingVelocity:     (days = 14) => get<VelocityPoint[]>(`/api/v1/analytics/finding-velocity?days=${days}`),
  scoreDistribution:   () => get<ScoreDistributionItem[]>('/api/v1/analytics/score-distribution'),
  topFiles:            (limit = 10) => get<TopFileItem[]>(`/api/v1/analytics/top-files?limit=${limit}`),
  reviewDuration:      () => get<ReviewDurationStats>('/api/v1/analytics/review-duration'),
};

