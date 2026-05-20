import type { Finding, Review, ReviewListOut, ReviewRetryOut, ReviewStatsOut } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';
const STORAGE_KEY = 'argus_api_key';

export function getStoredApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearStoredApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getStoredApiKey();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (res.status === 401) {
    clearStoredApiKey();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  verifyKey: (key: string) =>
    fetch(`${BASE}/api/v1/auth/verify`, {
      headers: { Authorization: `Bearer ${key}` },
    }).then(r => r.ok),

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

