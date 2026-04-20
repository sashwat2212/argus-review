import type { Finding, Review, ReviewListOut } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listReviews: (page = 1, pageSize = 20) =>
    apiFetch<ReviewListOut>(`/api/v1/reviews?page=${page}&page_size=${pageSize}`),

  getReview: (id: string) =>
    apiFetch<Review>(`/api/v1/reviews/${id}`),

  resolveFinding: (reviewId: string, findingId: string) =>
    apiFetch<Finding>(`/api/v1/reviews/${reviewId}/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_resolved: true }),
    }),
};
