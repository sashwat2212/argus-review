import type { Finding, Review, ReviewListOut, ReviewRetryOut, ReviewStatsOut } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include', // Ensures HTTP-only JWT cookies are sent
    ...init,
  });
  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  getMe: () =>
    apiFetch<{ id: string; github_login: string; email: string; avatar_url: string; role: string; org_id: string }>(`/api/v1/auth/me`),

  listReviews: (page = 1, pageSize = 20, status?: string) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.set('status', status);
    return apiFetch<ReviewListOut>(`/api/v1/reviews?${params}`);
  },

  getReview: (id: string) =>
    apiFetch<Review>(`/api/v1/reviews/${id}`),

  getReviewStats: (id: string) =>
    apiFetch<ReviewStatsOut>(`/api/v1/reviews/${id}/stats`),

  resolveFinding: (reviewId: string, findingId: string) =>
    apiFetch<Finding>(`/api/v1/reviews/${reviewId}/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_resolved: true }),
    }),

  resolveAll: (reviewId: string) =>
    apiFetch<{ status: string }>(`/api/v1/reviews/${reviewId}/findings/resolve-all`, {
      method: 'POST',
    }),

  retryReview: (id: string) =>
    apiFetch<ReviewRetryOut>(`/api/v1/reviews/${id}/retry`, { method: 'POST' }),
};

