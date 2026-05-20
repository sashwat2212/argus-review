# GitHub Integration v1 — Design Spec

**Date:** 2026-05-01
**Sub-project:** 1 of 3 (GitHub Flow & Visibility)
**Status:** Approved

---

## Goal

Wire the existing GitHub client code into a fully observable, end-to-end working flow: real PR → webhook → Celery review → inline PR comments → commit status → dashboard visibility. Add PR links, a re-review button, and polish the dashboard UI to a professional standard.

## Architecture

Approach A (minimal patch): one new database column, two backend changes, one new API endpoint, and targeted dashboard UI upgrades. No new tables, no new services.

The existing code already has `post_pr_review()` and `set_commit_status()` in `github_client.py` and calls them from `review_task.py`. The gaps are: errors are swallowed silently, the result is never persisted, the dashboard has no visibility into GitHub status, and there is no way to re-trigger a review.

**Tech Stack:** FastAPI, SQLAlchemy + Alembic, Celery, React + Tailwind, React Query, ngrok

---

## Section 1: Database & Backend

### 1.1 New column: `github_comment_status` on `reviews`

Add a nullable string column to the `reviews` table with four allowed values:

| Value | Meaning |
|-------|---------|
| `pending` | Default. Review completed but GitHub posting not yet attempted. |
| `success` | Comment posted and commit status set successfully. |
| `failed` | One or more GitHub API calls returned a non-2xx response. |
| `skipped` | `GITHUB_TOKEN` not configured — GitHub posting intentionally bypassed. |

- Default: `None` (null) — meaning no attempt yet or review still running.
- One Alembic migration required.
- No index needed — this is display-only, not filtered in queries.

### 1.2 `github_client.py` — return results instead of swallowing errors

Both `post_pr_review()` and `set_commit_status()` currently return `None` and log warnings on failure. Change both to return `bool`:
- `True` on HTTP 200 or 201
- `False` on any other status code or exception

`post_pr_review()` already has a fallback to `_post_plain_comment()` when the review API fails. This fallback should still run, but the function should return `False` if it had to fall back (partial success counts as failed for status tracking).

### 1.3 `review_task.py` — persist GitHub status

After calling `post_pr_review()` and `set_commit_status()`:
- If `GITHUB_TOKEN` is not set: write `github_comment_status = "skipped"` to the review.
- If both calls return `True`: write `github_comment_status = "success"`.
- If either returns `False`: write `github_comment_status = "failed"`.

Log each GitHub API call result at `INFO` level regardless of outcome.

### 1.4 New endpoint: `POST /api/v1/reviews/{id}/retry`

Creates a new review from an existing one. Steps:
1. Load the original review by `id` (404 if not found).
2. Load the associated `Repository` to get `full_name`.
3. Reconstruct diff URL: `https://api.github.com/repos/{full_name}/pulls/{pr_number}`.
4. Create a new `Review` record with the same `repo_id`, `pr_number`, `pr_title`, `base_sha`, `head_sha`, `trigger_type="retry"`, `status="pending"`.
5. Commit new record to DB.
6. Queue `run_review_task.delay(review_id, diff_url, head_sha, repo_full_name)`.
7. Return `{"review_id": "<new_id>", "status": "queued"}`.

Requires `require_api_key` dependency. Rate-limited to 10/minute.

### 1.5 API schema: include `repo_full_name` in review responses

`ReviewOut` and `ReviewListOut` items currently return `repo_id` (UUID) but not the human-readable repo name. Add `repo_full_name: str` to `ReviewOut` by joining `Repository.full_name` in the query. This is needed to construct the GitHub PR link on the frontend.

---

## Section 2: Dashboard

### 2.1 GitHub status badge

A new `GitHubStatusBadge` component rendered next to `StatusBadge` on review cards and review detail. Only shown when `status` is `completed` or `failed`.

| `github_comment_status` | Badge |
|------------------------|-------|
| `success` | `✅ Commented` — green (bg-green-500/10 text-green-400) |
| `failed` | `❌ Failed` — red (bg-red-500/10 text-red-400) |
| `skipped` | `⏭ Skipped` — gray-muted (bg-gray-500/10 text-gray-500) |
| `pending` / null | `⏳ Pending` — gray (bg-gray-500/10 text-gray-400) |

### 2.2 PR link on review cards

Each review card in `ReviewList.tsx` and `ReviewDetail.tsx` gets a "View PR →" link that opens `https://github.com/{repo_full_name}/pull/{pr_number}` in a new tab. Uses `target="_blank" rel="noopener noreferrer"`. Only rendered when `repo_full_name` and `pr_number` are present.

### 2.3 Re-review button

In `ReviewDetail.tsx`, a "Re-review" button appears when `status` is `completed` or `failed`. On click:
1. Button enters loading state (spinner, disabled).
2. Calls `POST /api/v1/reviews/{id}/retry`.
3. On success: show a toast ("Re-review queued") and navigate back to `/reviews`.
4. On error: show an error toast ("Failed to queue re-review").

### 2.4 Skeleton loaders

Replace all loading spinners with shimmer skeleton cards:
- `ReviewList.tsx`: show 5 placeholder rows while fetching.
- `DashboardPage.tsx`: show skeleton stat cards and chart placeholders.
- `ReviewDetail.tsx`: show skeleton finding cards while loading.

Use a `Skeleton` utility component (`animate-pulse bg-gray-700/50 rounded`) reused across all three.

### 2.5 Toast notification system

A `ToastProvider` wraps the app at the `App.tsx` level. A `useToast()` hook exposes `toast.success(msg)` and `toast.error(msg)`. Toasts appear bottom-right, auto-dismiss after 4 seconds, max 3 visible at once. Used for:
- Re-review queued
- GitHub API failure notification (when `github_comment_status` flips to `failed` on a polled review)
- Sign-out confirmation

### 2.6 Sortable review table

Column headers in `ReviewList.tsx` for Score, Date, and Status become clickable sort toggles. Sort state is local (`useState`). Clicking the same column twice reverses direction. Default: Date descending.

### 2.7 Better empty states

When the review list is empty, show a centered card:
- Icon: magnifying glass (SVG inline)
- Heading: "No reviews yet"
- Body: "Set up your GitHub webhook to start receiving automatic code reviews."
- Link: "View setup guide →" (links to docs/self-hosting.md)

Same pattern for Repositories page.

### 2.8 Sidebar badges with live counts

The sidebar nav items "Reviews" and "Repositories" show a live count badge pulled from the overview analytics endpoint. Updates every 30 seconds. Shown as a small pill: `bg-gray-700 text-gray-300 text-xs rounded-full px-2`.

### 2.9 Two-panel review detail layout

`ReviewDetail.tsx` splits into two panels on screens ≥ 1024px:
- **Left panel (40%):** Scrollable findings list. Each finding is a compact row showing severity icon, title, file path. Clicking selects it and highlights it.
- **Right panel (60%):** Full detail of the selected finding — description, why it matters, suggested fix, agent, confidence. Defaults to the first finding.
- On mobile (< 1024px): single column, findings list stacked above detail.

### 2.10 Row hover + click states

Review table rows in `ReviewList.tsx`:
- `hover:bg-gray-800/50` on hover.
- `cursor-pointer` on the entire row.
- Clicking anywhere on the row navigates to the review detail (same as clicking a dedicated button today).

### 2.11 Smooth page transitions

Route changes use a 150ms opacity fade. Implemented with a `PageTransition` wrapper component using Tailwind's `transition-opacity duration-150`.

---

## Section 3: Webhook Setup & End-to-End Testing

### 3.1 ngrok setup (one-time)

```bash
# Start ngrok tunnel
ngrok http 8000

# Copy the forwarding URL shown, e.g.:
# https://pennant-mounting-country.ngrok-free.dev
```

The `NGROK_URL` in `.env` is already set. No code change needed — it's informational only.

### 3.2 GitHub webhook configuration (one-time per repo)

In your test GitHub repo:
1. Settings → Webhooks → Add webhook
2. **Payload URL:** `https://<ngrok-url>/webhooks/github`
3. **Content type:** `application/json`
4. **Secret:** value of `GITHUB_WEBHOOK_SECRET` from `.env`
5. **Events:** select "Pull requests" only
6. Save

### 3.3 Verification checklist

After setup, open a PR on your test repo and verify:
- [ ] Celery worker logs show `run_review_task` running
- [ ] PR receives an inline comment per finding + summary comment
- [ ] Commit status updates to ✅ or ❌ on the PR
- [ ] Dashboard shows the new review with correct `github_comment_status`
- [ ] `github_comment_status` is `success`, not `pending` or `failed`

---

## Files Created or Modified

| Action | File | Change |
|--------|------|--------|
| Create | `packages/api/alembic/versions/xxxx_add_github_comment_status.py` | Migration adding column |
| Modify | `packages/api/argus_api/models/review.py` | Add `github_comment_status` field |
| Modify | `packages/api/argus_api/schemas/review.py` | Add `github_comment_status`, `repo_full_name` to `ReviewOut` |
| Modify | `packages/api/argus_api/github_client.py` | Return `bool` from both posting functions |
| Modify | `packages/api/argus_api/tasks/review_task.py` | Persist `github_comment_status` after posting |
| Modify | `packages/api/argus_api/routers/reviews.py` | Add retry endpoint, join `repo_full_name` into list/detail queries |
| Create | `packages/dashboard/src/components/GitHubStatusBadge.tsx` | New badge component |
| Create | `packages/dashboard/src/components/Skeleton.tsx` | Shimmer placeholder utility |
| Create | `packages/dashboard/src/components/Toast.tsx` | Toast component + provider |
| Create | `packages/dashboard/src/hooks/useToast.ts` | Toast hook |
| Create | `packages/dashboard/src/components/PageTransition.tsx` | 150ms fade wrapper |
| Modify | `packages/dashboard/src/components/ReviewList.tsx` | Skeleton, sortable columns, row click, empty state, PR link, GitHub badge |
| Modify | `packages/dashboard/src/components/ReviewDetail.tsx` | Two-panel layout, re-review button, PR link, GitHub badge, skeleton |
| Modify | `packages/dashboard/src/layouts/AppShell.tsx` | Sidebar live count badges |
| Modify | `packages/dashboard/src/pages/DashboardPage.tsx` | Skeleton loaders for stat cards and charts |
| Modify | `packages/dashboard/src/pages/RepositoriesPage.tsx` | Empty state |
| Modify | `packages/dashboard/src/App.tsx` | Wrap with ToastProvider, PageTransition on routes |
| Modify | `packages/dashboard/src/api/client.ts` | Add retry API call |

---

## Out of Scope (Sub-project 2 and 3)

- Diff preview inside the dashboard
- PR summarization / release notes
- Line-by-line code suggestions
- Per-commit incremental reviews
- Smart review skipping
- Customizable prompts
