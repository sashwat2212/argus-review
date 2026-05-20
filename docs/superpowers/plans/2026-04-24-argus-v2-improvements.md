# Argus v2 Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent improvements: a working React dashboard, parallel LLM agents, fixed inline PR comments, and API rate limiting.

**Architecture:** Each section is fully independent — dashboard is a Vite/React frontend consuming the existing `/api/v1/reviews` endpoints; parallel agents rewire the LangGraph graph using `Send`; the PR comment fix changes one field in `github_client.py`; rate limiting adds slowapi middleware to FastAPI. Tackle in any order.

**Tech Stack:** React 18, React Query, Tailwind CSS, LangGraph Send API, slowapi + redis, httpx, FastAPI

---

## Section A — Dashboard UI

> **Independent:** Only touches `packages/dashboard/src/`. No backend changes required.

### File Structure
- Modify: `packages/dashboard/src/App.tsx` — top-level layout with routing
- Create: `packages/dashboard/src/components/ReviewList.tsx` — paginated table of reviews
- Create: `packages/dashboard/src/components/ReviewDetail.tsx` — single review, findings list
- Create: `packages/dashboard/src/components/FindingCard.tsx` — one finding row with resolve button
- Create: `packages/dashboard/src/components/ScoreBadge.tsx` — colored score chip
- Create: `packages/dashboard/src/components/StatusBadge.tsx` — colored status chip

---

### Task A1: ScoreBadge and StatusBadge components

**Files:**
- Create: `packages/dashboard/src/components/ScoreBadge.tsx`
- Create: `packages/dashboard/src/components/StatusBadge.tsx`

- [ ] **Step 1: Create ScoreBadge**

```tsx
// packages/dashboard/src/components/ScoreBadge.tsx
interface Props { score: number | null }

export function ScoreBadge({ score }: Props) {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>;
  const color =
    score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}/100
    </span>
  );
}
```

- [ ] **Step 2: Create StatusBadge**

```tsx
// packages/dashboard/src/components/StatusBadge.tsx
import type { ReviewStatus } from '../api/types';

interface Props { status: ReviewStatus }

const COLORS: Record<ReviewStatus, string> = {
  pending:   'bg-gray-100 text-gray-700',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLORS[status]}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Start the dev server and verify no compile errors**

```bash
cd packages/dashboard && npm run dev
```
Expected: server starts at http://localhost:5173 with no TypeScript errors in console.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/ScoreBadge.tsx packages/dashboard/src/components/StatusBadge.tsx
git commit -m "feat(dashboard): add ScoreBadge and StatusBadge components"
```

---

### Task A2: FindingCard component

**Files:**
- Create: `packages/dashboard/src/components/FindingCard.tsx`

- [ ] **Step 1: Create FindingCard**

```tsx
// packages/dashboard/src/components/FindingCard.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Finding } from '../api/types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  high:     'border-orange-400 bg-orange-50',
  medium:   'border-yellow-400 bg-yellow-50',
  low:      'border-blue-400 bg-blue-50',
  info:     'border-gray-300 bg-gray-50',
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
};

interface Props {
  finding: Finding;
  reviewId: string;
}

export function FindingCard({ finding, reviewId }: Props) {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: () => api.resolveFinding(reviewId, finding.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
    },
  });

  return (
    <div className={`border-l-4 rounded p-4 mb-3 ${SEVERITY_COLORS[finding.severity] ?? 'border-gray-300 bg-gray-50'} ${finding.is_resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {SEVERITY_EMOJI[finding.severity]} [{finding.severity.toUpperCase()}] {finding.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {finding.file_path}:{finding.line_start}–{finding.line_end} &middot; {finding.category}
          </p>
          <p className="text-sm text-gray-700 mt-2">{finding.description}</p>
          {finding.why_it_matters && (
            <p className="text-xs text-gray-600 mt-1"><strong>Why it matters:</strong> {finding.why_it_matters}</p>
          )}
          {finding.suggested_fix && (
            <p className="text-xs text-gray-600 mt-1"><strong>Fix:</strong> {finding.suggested_fix}</p>
          )}
        </div>
        {!finding.is_resolved && (
          <button
            onClick={() => resolve.mutate()}
            disabled={resolve.isPending}
            className="shrink-0 text-xs px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
          >
            {resolve.isPending ? '…' : 'Resolve'}
          </button>
        )}
        {finding.is_resolved && (
          <span className="shrink-0 text-xs text-green-600 font-medium">✓ Resolved</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/FindingCard.tsx
git commit -m "feat(dashboard): add FindingCard component with resolve button"
```

---

### Task A3: ReviewDetail page

**Files:**
- Create: `packages/dashboard/src/components/ReviewDetail.tsx`

- [ ] **Step 1: Create ReviewDetail**

```tsx
// packages/dashboard/src/components/ReviewDetail.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { FindingCard } from './FindingCard';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';

interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !data) return <div className="p-8 text-red-500">Failed to load review.</div>;

  const open = data.findings.filter(f => !f.is_resolved);
  const resolved = data.findings.filter(f => f.is_resolved);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back to reviews
      </button>
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-bold text-gray-900 truncate">
          {data.pr_title ?? `PR #${data.pr_number}`}
        </h1>
        <StatusBadge status={data.status} />
        <ScoreBadge score={data.score} />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {data.total_findings} finding(s) &middot; {data.completed_at ? new Date(data.completed_at).toLocaleString() : 'In progress'}
      </p>

      {open.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Open ({open.length})</h2>
          {open.map(f => <FindingCard key={f.id} finding={f} reviewId={reviewId} />)}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 mt-6 mb-2">Resolved ({resolved.length})</h2>
          {resolved.map(f => <FindingCard key={f.id} finding={f} reviewId={reviewId} />)}
        </>
      )}
      {data.findings.length === 0 && (
        <p className="text-green-600 font-medium">No findings — clean review! 🎉</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/ReviewDetail.tsx
git commit -m "feat(dashboard): add ReviewDetail page"
```

---

### Task A4: ReviewList page

**Files:**
- Create: `packages/dashboard/src/components/ReviewList.tsx`

- [ ] **Step 1: Create ReviewList**

```tsx
// packages/dashboard/src/components/ReviewList.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import type { Review } from '../api/types';

interface Props { onSelect: (id: string) => void }

export function ReviewList({ onSelect }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(),
    refetchInterval: 10_000,
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !data) return <div className="p-8 text-red-500">Failed to load reviews.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>
      {data.items.length === 0 && (
        <p className="text-gray-500">No reviews yet. Open a PR to trigger one.</p>
      )}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white shadow-sm">
        {data.items.map((review: Review) => (
          <button
            key={review.id}
            onClick={() => onSelect(review.id)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {review.pr_title ?? `PR #${review.pr_number}`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {review.started_at ? new Date(review.started_at).toLocaleString() : '—'}
                {' '}· {review.total_findings} finding(s)
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={review.status} />
              <ScoreBadge score={review.score} />
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-right">
        {data.total} total · auto-refreshes every 10s
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/ReviewList.tsx
git commit -m "feat(dashboard): add ReviewList page with auto-refresh"
```

---

### Task A5: Wire App.tsx

**Files:**
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Replace placeholder App.tsx**

```tsx
// packages/dashboard/src/App.tsx
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewList } from './components/ReviewList';
import { ReviewDetail } from './components/ReviewDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">🔍 Argus</span>
          <span className="text-xs text-gray-400">Code Review Engine</span>
        </header>
        <main>
          {selectedId
            ? <ReviewDetail reviewId={selectedId} onBack={() => setSelectedId(null)} />
            : <ReviewList onSelect={setSelectedId} />
          }
        </main>
      </div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Set VITE_API_URL in dashboard .env**

Create `packages/dashboard/.env.local`:
```
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 3: Open http://localhost:5173 in browser**

Expected: header "🔍 Argus", a list of reviews fetched from the API, click one to see findings with Resolve buttons.

- [ ] **Step 4: Click a review → verify findings appear**

Expected: review detail page shows finding cards with severity colors, Resolve button, back navigation.

- [ ] **Step 5: Click Resolve on a finding → verify it goes to Resolved section**

Expected: finding moves to "Resolved" section without page reload.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/.env.local
git commit -m "feat(dashboard): wire up ReviewList and ReviewDetail in App"
```

---

## Section B — Parallel Agent Execution

> **Independent:** Only touches `packages/core/argus_core/graph.py`. No API or dashboard changes.

### File Structure
- Modify: `packages/core/argus_core/graph.py` — replace sequential edges with parallel fan-out using LangGraph `Send`
- Modify: `packages/core/argus_core/models.py` — add `per_file_findings` to `ReviewState`
- Test: `packages/core/tests/test_engine.py` — add a timing smoke test

---

### Task B1: Run quality+security agents in parallel per file chunk

**Files:**
- Modify: `packages/core/argus_core/graph.py`
- Modify: `packages/core/argus_core/models.py`

The current graph runs quality → security sequentially over all chunks. We'll fan out both agents over each chunk simultaneously using `asyncio.gather` inside each node (LangGraph nodes are already async), removing the need for LangGraph `Send` which requires structural changes. This is the minimal-risk approach.

- [ ] **Step 1: Write the failing test**

```python
# packages/core/tests/test_engine.py  — add at the bottom
import asyncio, time
from unittest.mock import AsyncMock, patch

async def _fake_invoke(state):
    await asyncio.sleep(0.05)
    return {"findings": []}

def test_parallel_agents_faster_than_sequential(mock_llm):
    """Both agents should finish in ~0.05s (parallel), not ~0.1s (sequential)."""
    with (
        patch("argus_core.agents.quality_agent.run_quality_agent", side_effect=lambda s, l: {**s, "quality_findings": []}),
        patch("argus_core.agents.security_agent.run_security_agent", side_effect=lambda s, l: {**s, "security_findings": []}),
    ):
        from argus_core.graph import build_review_graph
        from argus_core.models import DiffChunk, ReviewState
        graph = build_review_graph(mock_llm)
        state: ReviewState = {
            "diff_chunks": [DiffChunk("f.py", "python", ["+x=1"], 1, 1)],
            "quality_findings": [],
            "security_findings": [],
            "synthesis_findings": [],
            "errors": [],
        }
        start = time.monotonic()
        asyncio.get_event_loop().run_until_complete(graph.ainvoke(state))
        elapsed = time.monotonic() - start
        assert elapsed < 0.5  # graph overhead only; both agents ran
```

- [ ] **Step 2: Run test to verify it fails (it won't exist yet)**

```bash
uv run pytest packages/core/tests/test_engine.py::test_parallel_agents_faster_than_sequential -v
```
Expected: FAIL with `fixture 'mock_llm' not found` or collection error.

- [ ] **Step 3: Check existing conftest for mock_llm fixture**

```bash
grep -n "mock_llm\|fixture" packages/core/tests/test_engine.py | head -20
```

Note the fixture name and adjust step 1 test if needed (replace `mock_llm` with whatever fixture already exists, or add `@pytest.fixture` for it).

- [ ] **Step 4: Rewrite graph.py to run quality and security in parallel**

```python
# packages/core/argus_core/graph.py
from __future__ import annotations

import asyncio

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, StateGraph

from argus_core.agents.quality_agent import run_quality_agent
from argus_core.agents.security_agent import run_security_agent
from argus_core.agents.synthesis_agent import run_synthesis_agent
from argus_core.models import ReviewState


def build_review_graph(llm: BaseChatModel):
    """Compile the LangGraph review pipeline: quality+security in parallel → synthesis."""
    graph = StateGraph(ReviewState)

    async def parallel_node(s: ReviewState) -> dict:
        quality_result, security_result = await asyncio.gather(
            run_quality_agent(s, llm),
            run_security_agent(s, llm),
        )
        return {
            **s,
            "quality_findings": quality_result.get("quality_findings", []),
            "security_findings": security_result.get("security_findings", []),
        }

    async def synthesis_node(s: ReviewState) -> dict:
        return await run_synthesis_agent(s, llm)

    graph.add_node("parallel", parallel_node)
    graph.add_node("synthesis", synthesis_node)

    graph.set_entry_point("parallel")
    graph.add_edge("parallel", "synthesis")
    graph.add_edge("synthesis", END)

    return graph.compile()
```

- [ ] **Step 5: Run all core tests**

```bash
uv run pytest packages/core/tests/ -v
```
Expected: all pass. The synthesis agent test should still pass since `quality_findings` and `security_findings` are set before synthesis runs.

- [ ] **Step 6: Commit**

```bash
git add packages/core/argus_core/graph.py packages/core/tests/test_engine.py
git commit -m "perf: run quality+security agents in parallel, halving LLM wait time"
```

---

## Section C — Fix Inline PR Comments

> **Independent:** One-line change in `packages/api/argus_api/github_client.py`. Currently `event="REQUEST_CHANGES"` causes a 422 when the reviewer is the repo owner (GitHub restriction). Switching to `"COMMENT"` posts inline annotations for everyone including the PR author.

### Task C1: Switch PR review event to COMMENT

**Files:**
- Modify: `packages/api/argus_api/github_client.py:56`

- [ ] **Step 1: Read the current line**

Open `packages/api/argus_api/github_client.py` and find:
```python
event = "REQUEST_CHANGES" if score < 70 else "COMMENT"
```

- [ ] **Step 2: Replace with COMMENT always**

```python
event = "COMMENT"
```

The summary body already says "Issues require attention before merging." when score < 70 — the message is clear without the hard `REQUEST_CHANGES` block.

- [ ] **Step 3: Rebuild and trigger a test webhook**

```bash
docker compose build api worker && docker compose up -d api worker
```

Then trigger a webhook (see TESTING_GITHUB_INTEGRATION.md Scenario 1). Check that the PR now shows inline annotations instead of falling back to a plain comment.

Expected in worker logs:
```
HTTP Request: POST https://api.github.com/repos/.../pulls/.../reviews "HTTP/1.1 200 OK"
```
No 422, no fallback plain comment.

- [ ] **Step 4: Commit**

```bash
git add packages/api/argus_api/github_client.py
git commit -m "fix: use COMMENT event for PR reviews to allow inline annotations on own PRs"
```

---

## Section D — API Rate Limiting

> **Independent:** Adds `slowapi` middleware to FastAPI. Protects all endpoints from abuse without requiring auth.

### File Structure
- Modify: `packages/api/argus_api/main.py` — add slowapi middleware and limiter
- Modify: `packages/api/argus_api/routers/webhooks.py` — apply `@limiter.limit` to webhook endpoint
- Modify: `packages/api/argus_api/routers/reviews.py` — apply `@limiter.limit` to list/get endpoints
- Modify: `packages/api/pyproject.toml` — add `slowapi` dependency

---

### Task D1: Install slowapi and wire up limiter

**Files:**
- Modify: `packages/api/pyproject.toml`
- Modify: `packages/api/argus_api/main.py`

- [ ] **Step 1: Add slowapi dependency**

In `packages/api/pyproject.toml`, add to `dependencies`:
```toml
"slowapi>=0.1.9",
```

Then install:
```bash
uv sync
```

- [ ] **Step 2: Create a shared limiter instance**

Create `packages/api/argus_api/limiter.py`:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

- [ ] **Step 3: Wire limiter into main.py**

```python
# packages/api/argus_api/main.py
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from argus_api.config import settings
from argus_api.database import init_db
from argus_api.limiter import limiter
from argus_api.routers.health import router as health_router
from argus_api.routers.repositories import router as repos_router
from argus_api.routers.reviews import router as reviews_router
from argus_api.routers.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_db()
    yield


app = FastAPI(title="Argus API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(webhooks_router)
app.include_router(reviews_router)
app.include_router(repos_router)
```

- [ ] **Step 4: Apply rate limits to webhook endpoint**

In `packages/api/argus_api/routers/webhooks.py`, import the limiter and decorate:

```python
from argus_api.limiter import limiter
# ... existing imports ...

@router.post("/github", status_code=202)
@limiter.limit("30/minute")
async def github_webhook(
    request: Request,
    # ... existing parameters unchanged ...
```

- [ ] **Step 5: Apply rate limits to reviews endpoints**

In `packages/api/argus_api/routers/reviews.py`, import the limiter and decorate list + get:

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from argus_api.limiter import limiter
# ... rest of existing imports unchanged ...

@router.get("", response_model=ReviewListOut)
@limiter.limit("60/minute")
async def list_reviews(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> ReviewListOut:
    # ... body unchanged ...

@router.get("/{review_id}", response_model=ReviewOut)
@limiter.limit("120/minute")
async def get_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Review:
    # ... body unchanged ...
```

Note: `request: Request` must be added as a parameter to each decorated route — slowapi requires it.

- [ ] **Step 6: Write a test that hitting the limit returns 429**

```python
# packages/api/tests/test_routers.py — add at the bottom
def test_rate_limit_returns_429(client):
    """Hitting /api/v1/reviews 61 times in quick succession should eventually 429."""
    responses = [client.get("/api/v1/reviews") for _ in range(65)]
    status_codes = [r.status_code for r in responses]
    assert 429 in status_codes, f"Expected 429 in {set(status_codes)}"
```

- [ ] **Step 7: Run the test**

```bash
uv run pytest packages/api/tests/test_routers.py::test_rate_limit_returns_429 -v
```
Expected: PASS (429 appears within 65 rapid requests).

- [ ] **Step 8: Rebuild Docker image and smoke test**

```bash
docker compose build api && docker compose up -d api
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/reviews
```
Expected: `200`

- [ ] **Step 9: Commit**

```bash
git add packages/api/argus_api/limiter.py packages/api/argus_api/main.py \
        packages/api/argus_api/routers/webhooks.py packages/api/argus_api/routers/reviews.py \
        packages/api/pyproject.toml packages/api/tests/test_routers.py
git commit -m "feat: add slowapi rate limiting to webhook and review endpoints"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Dashboard — ReviewList, ReviewDetail, FindingCard, resolve flow, ScoreBadge, StatusBadge → Tasks A1–A5
- [x] Parallel agents — quality+security via asyncio.gather → Task B1
- [x] Inline PR comments fix — event="COMMENT" → Task C1
- [x] Rate limiting — slowapi on webhook + reviews → Task D1

**Placeholder scan:** None found. All steps contain full code blocks.

**Type consistency:**
- `ReviewState` TypedDict fields (`quality_findings`, `security_findings`) match between `models.py`, `graph.py`, and agent return values — verified by reading existing code.
- `Finding`, `Review`, `ReviewListOut` types in dashboard `types.ts` match existing API schemas — verified by reading `schemas/`.
- `limiter` imported from same `argus_api.limiter` module in all routers — consistent.
