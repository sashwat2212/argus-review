# Argus v3 — Auth, Analytics & Docker Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship API key authentication, a heavy-duty analytics dashboard with charts and navigation, and a Dockerized dashboard service.

**Architecture:** Three independent sections. Auth adds Bearer API key verification to all `/api/v1/` routes (webhooks exempt — they use HMAC). Analytics adds four new aggregation endpoints and a completely wraps the Vite build in an nginx container.

**Tech Stack:** FastAPI, SQLAlchemy aggregations, React Router DOM, Recharts, Tailwind CSS, nginx, Docker multi-stage build

---

## Section E — API Key Authentication

### File Structure

- Modify: `packages/api/argus_api/config.py` — add `api_key: str` setting
- Create: `packages/api/argus_api/dependencies.py` — `require_api_key` FastAPI dependency
- Modify: `packages/api/argus_api/routers/reviews.py` — add `require_api_key` dependency
- Modify: `packages/api/argus_api/routers/repositories.py` — add `require_api_key` dependency
- Create: `packages/api/argus_api/routers/auth.py` — `GET /api/v1/auth/verify` endpoint
- Modify: `packages/api/argus_api/main.py` — register auth router
- Modify: `packages/dashboard/src/api/client.ts` — add Authorization header to all requests
- Create: `packages/dashboard/src/pages/LoginPage.tsx` — API key entry form
- Modify: `packages/dashboard/src/App.tsx` — gate behind LoginPage if no key stored

---

### Task E1: Add api_key to config and create require_api_key dependency

**Files:**

- Modify: `packages/api/argus_api/config.py`
- Create: `packages/api/argus_api/dependencies.py`
- Test: `packages/api/tests/test_routers.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_routers.py`:

```python
def test_list_reviews_requires_auth(client):
    """GET /api/v1/reviews with no token should return 401."""
    response = client.get("/api/v1/reviews")
    assert response.status_code == 401

def test_list_reviews_with_valid_token(client):
    """GET /api/v1/reviews with correct Bearer token should return 200."""
    response = client.get("/api/v1/reviews", headers={"Authorization": "Bearer test-api-key"})
    assert response.status_code == 200

def test_list_reviews_with_wrong_token(client):
    """GET /api/v1/reviews with wrong token should return 401."""
    response = client.get("/api/v1/reviews", headers={"Authorization": "Bearer wrong-key"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/api/tests/test_routers.py::test_list_reviews_requires_auth -v
```

Expected: FAIL (currently returns 200 with no auth).

- [ ] **Step 3: Add `api_key` to Settings**

In `packages/api/argus_api/config.py`, add one field:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://argus:argus_dev@localhost:5432/argus"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-me-in-production"
    api_key: str = "change-me-api-key"   # <-- add this line
    github_webhook_secret: str = ""
    github_token: str = ""
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    argus_llm_backend: str = "ollama"
    argus_ollama_base_url: str = "http://localhost:11434"
    argus_ollama_model: str = "codellama:13b"
    anthropic_api_key: str = ""
    argus_anthropic_model: str = "claude-sonnet-4-6"
```

- [ ] **Step 4: Create `packages/api/argus_api/dependencies.py`**

```python
from __future__ import annotations

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from argus_api.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    if credentials is None or credentials.credentials != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
```

- [ ] **Step 5: Check what `client` fixture uses for api_key**

Read `packages/api/tests/conftest.py` to see how `Settings` is configured in tests. The test `test_list_reviews_with_valid_token` passes `"Bearer test-api-key"` — make sure the test fixture sets `settings.api_key = "test-api-key"` or override via env.

If conftest uses `TestClient(app)` directly with no settings override, add this to conftest.py:

```python
import os
os.environ.setdefault("ARGUS_API_KEY", "test-api-key")
```

Add that line before `from argus_api.main import app` in conftest.

- [ ] **Step 6: Add dependency to reviews router**

In `packages/api/argus_api/routers/reviews.py`, add import and `Depends`:

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from argus_api.dependencies import require_api_key
```

Add `Depends(require_api_key)` to each route:

```python
@router.get("", response_model=ReviewListOut)
@limiter.limit("60/minute")
async def list_reviews(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> ReviewListOut:
    ...

@router.get("/{review_id}", response_model=ReviewOut)
@limiter.limit("120/minute")
async def get_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> Review:
    ...

@router.patch("/{review_id}/findings/{finding_id}", response_model=FindingOut)
async def patch_finding(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingPatch,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> Finding:
    ...
```

- [ ] **Step 7: Add dependency to repositories router**

In `packages/api/argus_api/routers/repositories.py`, same pattern:

```python
from argus_api.dependencies import require_api_key

@router.get("", response_model=list[RepositoryOut])
async def list_repositories(
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> list[Repository]:
    ...

@router.get("/{repo_id}", response_model=RepositoryOut)
async def get_repository(
    repo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> Repository:
    ...
```

- [ ] **Step 8: Run tests**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all pass including the three new auth tests.

- [ ] **Step 9: Commit**

```bash
git add packages/api/argus_api/config.py packages/api/argus_api/dependencies.py \
        packages/api/argus_api/routers/reviews.py packages/api/argus_api/routers/repositories.py \
        packages/api/tests/test_routers.py
git commit -m "feat: add API key authentication to all /api/v1/ routes"
```

---

### Task E2: Auth verify endpoint

**Files:**

- Create: `packages/api/argus_api/routers/auth.py`
- Modify: `packages/api/argus_api/main.py`

- [ ] **Step 1: Create `packages/api/argus_api/routers/auth.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends

from argus_api.dependencies import require_api_key

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/verify")
async def verify(_auth: None = Depends(require_api_key)) -> dict:
    return {"status": "ok"}
```

- [ ] **Step 2: Register auth router in `packages/api/argus_api/main.py`**

Add import and include:

```python
from argus_api.routers.auth import router as auth_router
# ... existing imports ...

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(webhooks_router)
app.include_router(reviews_router)
app.include_router(repos_router)
```

- [ ] **Step 3: Add `ARGUS_API_KEY` to `.env`**

In the project root `.env`, add:

```
ARGUS_API_KEY=argus-dev-key-change-in-prod
```

- [ ] **Step 4: Add `ARGUS_API_KEY` to `docker-compose.yml` api and worker services**

In `docker-compose.yml`, under `api.environment` and `worker.environment`, add:

```yaml
ARGUS_API_KEY: ${ARGUS_API_KEY:-argus-dev-key-change-in-prod}
```

- [ ] **Step 5: Test manually**

```bash
curl -s http://localhost:8000/api/v1/auth/verify \
  -H "Authorization: Bearer argus-dev-key-change-in-prod"
```

Expected: `{"status":"ok"}`

```bash
curl -s http://localhost:8000/api/v1/auth/verify
```

Expected: `{"detail":"Invalid or missing API key"}`

- [ ] **Step 6: Commit**

```bash
git add packages/api/argus_api/routers/auth.py packages/api/argus_api/main.py \
        .env docker-compose.yml
git commit -m "feat: add /api/v1/auth/verify endpoint and wire ARGUS_API_KEY into docker-compose"
```

---

### Task E3: Dashboard login gate

**Files:**

- Modify: `packages/dashboard/src/api/client.ts`
- Create: `packages/dashboard/src/pages/LoginPage.tsx`
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Update `packages/dashboard/src/api/client.ts` to send Bearer token**

Replace the entire file:

```typescript
import type { Finding, Review, ReviewListOut } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";
const STORAGE_KEY = "argus_api_key";

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
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (res.status === 401) {
    clearStoredApiKey();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  verifyKey: (key: string) =>
    fetch(`${BASE}/api/v1/auth/verify`, {
      headers: { Authorization: `Bearer ${key}` },
    }).then((r) => r.ok),

  listReviews: (page = 1, pageSize = 20, status?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (status) params.set("status", status);
    return apiFetch<ReviewListOut>(`/api/v1/reviews?${params}`);
  },

  getReview: (id: string) => apiFetch<Review>(`/api/v1/reviews/${id}`),

  resolveFinding: (reviewId: string, findingId: string) =>
    apiFetch<Finding>(`/api/v1/reviews/${reviewId}/findings/${findingId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_resolved: true }),
    }),
};
```

- [ ] **Step 2: Create `packages/dashboard/src/pages/LoginPage.tsx`**

```tsx
import { useState } from "react";
import { api, setStoredApiKey } from "../api/client";

interface Props {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await api.verifyKey(key.trim());
      if (ok) {
        setStoredApiKey(key.trim());
        onSuccess();
      } else {
        setError("Invalid API key. Check your ARGUS_API_KEY in .env.");
      }
    } catch {
      setError("Could not reach the Argus API. Is it running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-white">Argus</h1>
            <p className="text-xs text-gray-400">Code Review Engine</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="argus-dev-key-..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? "Verifying…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-6 text-center">
          Set <code className="text-gray-500">ARGUS_API_KEY</code> in your .env
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `packages/dashboard/src/App.tsx` to gate behind login**

We'll add auth state in a later task when we add routing. For now, just gate the whole app:

```tsx
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewList } from "./components/ReviewList";
import { ReviewDetail } from "./components/ReviewDetail";
import { LoginPage } from "./pages/LoginPage";
import { getStoredApiKey } from "./api/client";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  const [authed, setAuthed] = useState(() => !!getStoredApiKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">🔍 Argus</span>
          <span className="text-xs text-gray-400">Code Review Engine</span>
        </header>
        <main>
          {selectedId ? (
            <ReviewDetail
              reviewId={selectedId}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <ReviewList onSelect={setSelectedId} />
          )}
        </main>
      </div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Test in browser**

Start API: `uv run uvicorn argus_api.main:app --reload --port 8000`
Start dashboard: `cd packages/dashboard && npm run dev`

Open http://localhost:5173. Expected: login form. Enter `argus-dev-key-change-in-prod`. Expected: dashboard loads.

Clear localStorage and reload — should show login again.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/api/client.ts packages/dashboard/src/pages/LoginPage.tsx \
        packages/dashboard/src/App.tsx
git commit -m "feat(dashboard): add API key login gate with localStorage persistence"
```

---

## Section F — Analytics Dashboard Redesign

### File Structure

**New API routes:**

- Create: `packages/api/argus_api/routers/analytics.py` — 4 aggregation endpoints
- Modify: `packages/api/argus_api/main.py` — register analytics router
- Modify: `packages/api/argus_api/schemas/review.py` — add analytics response schemas

**Dashboard redesign — full multi-page app with dark sidebar:**

- Create: `packages/dashboard/src/layouts/AppShell.tsx` — dark sidebar + top bar layout
- Create: `packages/dashboard/src/pages/DashboardPage.tsx` — overview with stat cards + charts
- Create: `packages/dashboard/src/pages/ReviewsPage.tsx` — reviews list (wraps existing ReviewList/ReviewDetail)
- Create: `packages/dashboard/src/pages/RepositoriesPage.tsx` — repository health table
- Create: `packages/dashboard/src/components/StatCard.tsx` — metric card with icon + trend
- Create: `packages/dashboard/src/components/ScoreTrendChart.tsx` — Recharts line chart
- Create: `packages/dashboard/src/components/SeverityDonutChart.tsx` — Recharts pie chart
- Create: `packages/dashboard/src/components/TopCategoriesChart.tsx` — Recharts bar chart
- Create: `packages/dashboard/src/api/analytics.ts` — typed API calls for analytics endpoints
- Modify: `packages/dashboard/src/api/types.ts` — add analytics types
- Modify: `packages/dashboard/src/App.tsx` — React Router with sidebar nav

---

### Task F1: Analytics API endpoints

**Files:**

- Create: `packages/api/argus_api/routers/analytics.py`
- Modify: `packages/api/argus_api/main.py`
- Modify: `packages/api/argus_api/schemas/review.py`

- [ ] **Step 1: Add analytics schemas to `packages/api/argus_api/schemas/review.py`**

Append to the file:

```python
class OverviewStats(BaseModel):
    total_reviews: int
    completed_reviews: int
    avg_score: float | None
    pass_rate: float | None  # fraction of completed reviews with score >= 70
    open_findings: int
    total_findings: int

class ScorePoint(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    score: float
    pr_title: str | None

class SeverityCount(BaseModel):
    severity: str
    count: int

class CategoryCount(BaseModel):
    category: str
    count: int
```

- [ ] **Step 2: Create `packages/api/argus_api/routers/analytics.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from argus_api.database import get_session
from argus_api.dependencies import require_api_key
from argus_api.limiter import limiter
from argus_api.models.finding import Finding
from argus_api.models.review import Review
from argus_api.schemas.review import CategoryCount, OverviewStats, ScorePoint, SeverityCount

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/overview", response_model=OverviewStats)
@limiter.limit("60/minute")
async def get_overview(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> OverviewStats:
    total = (await session.execute(select(func.count()).select_from(Review))).scalar_one()
    completed = (await session.execute(
        select(func.count()).select_from(Review).where(Review.status == "completed")
    )).scalar_one()
    avg_score_row = (await session.execute(
        select(func.avg(Review.score)).where(Review.status == "completed")
    )).scalar_one()
    pass_count = (await session.execute(
        select(func.count()).select_from(Review).where(
            Review.status == "completed", Review.score >= 70
        )
    )).scalar_one()
    open_findings = (await session.execute(
        select(func.count()).select_from(Finding).where(Finding.is_resolved.is_(False))
    )).scalar_one()
    total_findings = (await session.execute(
        select(func.count()).select_from(Finding)
    )).scalar_one()

    return OverviewStats(
        total_reviews=total,
        completed_reviews=completed,
        avg_score=round(float(avg_score_row), 1) if avg_score_row is not None else None,
        pass_rate=round(pass_count / completed, 3) if completed > 0 else None,
        open_findings=open_findings,
        total_findings=total_findings,
    )


@router.get("/score-trend", response_model=list[ScorePoint])
@limiter.limit("60/minute")
async def get_score_trend(
    request: Request,
    limit: int = 30,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> list[ScorePoint]:
    rows = (await session.execute(
        select(Review.completed_at, Review.score, Review.pr_title)
        .where(Review.status == "completed", Review.score.is_not(None))
        .order_by(Review.completed_at.asc())
        .limit(limit)
    )).all()
    return [
        ScorePoint(
            date=r.completed_at.strftime("%Y-%m-%d") if r.completed_at else "",
            score=float(r.score),
            pr_title=r.pr_title,
        )
        for r in rows
    ]


@router.get("/severity-breakdown", response_model=list[SeverityCount])
@limiter.limit("60/minute")
async def get_severity_breakdown(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> list[SeverityCount]:
    rows = (await session.execute(
        select(Finding.severity, func.count().label("cnt"))
        .where(Finding.is_resolved.is_(False))
        .group_by(Finding.severity)
        .order_by(func.count().desc())
    )).all()
    return [SeverityCount(severity=r.severity, count=r.cnt) for r in rows]


@router.get("/top-categories", response_model=list[CategoryCount])
@limiter.limit("60/minute")
async def get_top_categories(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> list[CategoryCount]:
    rows = (await session.execute(
        select(Finding.category, func.count().label("cnt"))
        .group_by(Finding.category)
        .order_by(func.count().desc())
        .limit(10)
    )).all()
    return [CategoryCount(category=r.category, count=r.cnt) for r in rows]
```

- [ ] **Step 3: Register analytics router in `packages/api/argus_api/main.py`**

Add:

```python
from argus_api.routers.analytics import router as analytics_router
# ...
app.include_router(analytics_router)
```

- [ ] **Step 4: Run ruff**

```bash
uv run ruff check packages/api/argus_api/routers/analytics.py
```

Expected: no errors.

- [ ] **Step 5: Test endpoints manually**

```bash
curl -s "http://localhost:8000/api/v1/analytics/overview" \
  -H "Authorization: Bearer argus-dev-key-change-in-prod" | python3 -m json.tool
```

Expected: JSON with `total_reviews`, `avg_score`, etc.

- [ ] **Step 6: Commit**

```bash
git add packages/api/argus_api/routers/analytics.py packages/api/argus_api/main.py \
        packages/api/argus_api/schemas/review.py
git commit -m "feat: add analytics API endpoints (overview, score-trend, severity, categories)"
```

---

### Task F2: Analytics TypeScript types and API client

**Files:**

- Modify: `packages/dashboard/src/api/types.ts`
- Create: `packages/dashboard/src/api/analytics.ts`

- [ ] **Step 1: Add analytics types to `packages/dashboard/src/api/types.ts`**

Append to the file:

```typescript
export interface OverviewStats {
  total_reviews: number;
  completed_reviews: number;
  avg_score: number | null;
  pass_rate: number | null;
  open_findings: number;
  total_findings: number;
}

export interface ScorePoint {
  date: string;
  score: number;
  pr_title: string | null;
}

export interface SeverityCount {
  severity: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}
```

- [ ] **Step 2: Create `packages/dashboard/src/api/analytics.ts`**

```typescript
import type {
  CategoryCount,
  OverviewStats,
  ScorePoint,
  SeverityCount,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";

function authHeader(): Record<string, string> {
  const key = localStorage.getItem("argus_api_key");
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export const analyticsApi = {
  overview: () => get<OverviewStats>("/api/v1/analytics/overview"),
  scoreTrend: (limit = 30) =>
    get<ScorePoint[]>(`/api/v1/analytics/score-trend?limit=${limit}`),
  severityBreakdown: () =>
    get<SeverityCount[]>("/api/v1/analytics/severity-breakdown"),
  topCategories: () => get<CategoryCount[]>("/api/v1/analytics/top-categories"),
};
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/api/types.ts packages/dashboard/src/api/analytics.ts
git commit -m "feat(dashboard): add analytics TypeScript types and API client"
```

---

### Task F3: StatCard component

**Files:**

- Create: `packages/dashboard/src/components/StatCard.tsx`

- [ ] **Step 1: Create `packages/dashboard/src/components/StatCard.tsx`**

```tsx
interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: "up" | "down" | "neutral";
  color: "blue" | "green" | "yellow" | "red" | "purple";
}

const BG: Record<Props["color"], string> = {
  blue: "bg-blue-500/10 border-blue-500/20",
  green: "bg-green-500/10 border-green-500/20",
  yellow: "bg-yellow-500/10 border-yellow-500/20",
  red: "bg-red-500/10 border-red-500/20",
  purple: "bg-purple-500/10 border-purple-500/20",
};

const ICON_BG: Record<Props["color"], string> = {
  blue: "bg-blue-500/20 text-blue-400",
  green: "bg-green-500/20 text-green-400",
  yellow: "bg-yellow-500/20 text-yellow-400",
  red: "bg-red-500/20 text-red-400",
  purple: "bg-purple-500/20 text-purple-400",
};

const TREND_ICON = { up: "↑", down: "↓", neutral: "→" };
const TREND_COLOR = {
  up: "text-green-400",
  down: "text-red-400",
  neutral: "text-gray-400",
};

export function StatCard({ label, value, sub, icon, trend, color }: Props) {
  return (
    <div className={`rounded-xl border p-5 ${BG[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          {sub && (
            <p
              className={`text-xs mt-1 ${trend ? TREND_COLOR[trend] : "text-gray-500"}`}
            >
              {trend && <span className="mr-1">{TREND_ICON[trend]}</span>}
              {sub}
            </p>
          )}
        </div>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${ICON_BG[color]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/StatCard.tsx
git commit -m "feat(dashboard): add StatCard component"
```

---

### Task F4: Recharts chart components

**Files:**

- Create: `packages/dashboard/src/components/ScoreTrendChart.tsx`
- Create: `packages/dashboard/src/components/SeverityDonutChart.tsx`
- Create: `packages/dashboard/src/components/TopCategoriesChart.tsx`

- [ ] **Step 1: Create `packages/dashboard/src/components/ScoreTrendChart.tsx`**

```tsx
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScorePoint } from "../api/types";

interface Props {
  data: ScorePoint[];
}

export function ScoreTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No completed reviews yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: "#1F2937",
            border: "1px solid #374151",
            borderRadius: 8,
          }}
          labelStyle={{ color: "#E5E7EB", fontSize: 12 }}
          itemStyle={{ color: "#60A5FA" }}
          formatter={(val: number) => [`${val}/100`, "Score"]}
        />
        <ReferenceLine
          y={70}
          stroke="#F59E0B"
          strokeDasharray="4 4"
          label={{ value: "Pass", fill: "#F59E0B", fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3B82F6"
          strokeWidth={2}
          dot={{ fill: "#3B82F6", r: 3 }}
          activeDot={{ r: 5, fill: "#60A5FA" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create `packages/dashboard/src/components/SeverityDonutChart.tsx`**

```tsx
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SeverityCount } from "../api/types";

interface Props {
  data: SeverityCount[];
}

const COLORS: Record<string, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#EAB308",
  low: "#3B82F6",
  info: "#6B7280",
};

export function SeverityDonutChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No open findings
      </div>
    );
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="severity"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.severity} fill={COLORS[d.severity] ?? "#6B7280"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#1F2937",
              border: "1px solid #374151",
              borderRadius: 8,
            }}
            itemStyle={{ color: "#E5E7EB", fontSize: 12 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: "#9CA3AF", fontSize: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center mt-[-20px]">
          <p className="text-2xl font-bold text-white">{total}</p>
          <p className="text-xs text-gray-400">open</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `packages/dashboard/src/components/TopCategoriesChart.tsx`**

```tsx
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryCount } from "../api/types";

interface Props {
  data: CategoryCount[];
}

const BAR_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#F97316",
  "#84CC16",
  "#6B7280",
];

export function TopCategoriesChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No findings yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#374151"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={{
            background: "#1F2937",
            border: "1px solid #374151",
            borderRadius: 8,
          }}
          itemStyle={{ color: "#E5E7EB", fontSize: 12 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ScoreTrendChart.tsx \
        packages/dashboard/src/components/SeverityDonutChart.tsx \
        packages/dashboard/src/components/TopCategoriesChart.tsx
git commit -m "feat(dashboard): add Recharts chart components for analytics"
```

---

### Task F5: AppShell layout with dark sidebar

**Files:**

- Create: `packages/dashboard/src/layouts/AppShell.tsx`

- [ ] **Step 1: Create `packages/dashboard/src/layouts/AppShell.tsx`**

```tsx
import { NavLink } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  onLogout: () => void;
}

const NAV = [
  { to: "/", icon: "📊", label: "Dashboard" },
  { to: "/reviews", icon: "🔍", label: "Reviews" },
  { to: "/repositories", icon: "📁", label: "Repos" },
];

export function AppShell({ children, onLogout }: Props) {
  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <div>
              <p className="text-sm font-bold text-white">Argus</p>
              <p className="text-xs text-gray-500">Code Review Engine</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors"
          >
            <span>🚪</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/layouts/AppShell.tsx
git commit -m "feat(dashboard): add dark sidebar AppShell layout"
```

---

### Task F6: DashboardPage with stat cards and charts

**Files:**

- Create: `packages/dashboard/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create `packages/dashboard/src/pages/DashboardPage.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import { ScoreTrendChart } from "../components/ScoreTrendChart";
import { SeverityDonutChart } from "../components/SeverityDonutChart";
import { StatCard } from "../components/StatCard";
import { TopCategoriesChart } from "../components/TopCategoriesChart";

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: analyticsApi.overview,
    refetchInterval: 30_000,
  });
  const trend = useQuery({
    queryKey: ["analytics", "trend"],
    queryFn: () => analyticsApi.scoreTrend(30),
  });
  const severity = useQuery({
    queryKey: ["analytics", "severity"],
    queryFn: analyticsApi.severityBreakdown,
  });
  const categories = useQuery({
    queryKey: ["analytics", "categories"],
    queryFn: analyticsApi.topCategories,
  });

  const stats = overview.data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Overview of all code reviews and findings
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Reviews"
          value={stats?.total_reviews ?? "—"}
          sub={`${stats?.completed_reviews ?? 0} completed`}
          icon="📋"
          color="blue"
        />
        <StatCard
          label="Avg Score"
          value={stats?.avg_score != null ? `${stats.avg_score}` : "—"}
          sub="out of 100"
          icon="⭐"
          color={
            stats?.avg_score != null
              ? stats.avg_score >= 80
                ? "green"
                : stats.avg_score >= 60
                  ? "yellow"
                  : "red"
              : "blue"
          }
          trend={
            stats?.avg_score != null
              ? stats.avg_score >= 70
                ? "up"
                : "down"
              : undefined
          }
        />
        <StatCard
          label="Pass Rate"
          value={
            stats?.pass_rate != null
              ? `${Math.round(stats.pass_rate * 100)}%`
              : "—"
          }
          sub="score ≥ 70"
          icon="✅"
          color={
            stats?.pass_rate != null
              ? stats.pass_rate >= 0.8
                ? "green"
                : stats.pass_rate >= 0.5
                  ? "yellow"
                  : "red"
              : "blue"
          }
          trend={
            stats?.pass_rate != null
              ? stats.pass_rate >= 0.7
                ? "up"
                : "down"
              : undefined
          }
        />
        <StatCard
          label="Open Findings"
          value={stats?.open_findings ?? "—"}
          sub={`of ${stats?.total_findings ?? 0} total`}
          icon="⚠️"
          color={
            stats?.open_findings != null
              ? stats.open_findings === 0
                ? "green"
                : stats.open_findings < 10
                  ? "yellow"
                  : "red"
              : "blue"
          }
        />
      </div>

      {/* Charts row 1: Score trend (full width) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Score Trend</h2>
        {trend.isLoading ? (
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <ScoreTrendChart data={trend.data ?? []} />
        )}
      </div>

      {/* Charts row 2: Severity donut + Top categories side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Open Findings by Severity
          </h2>
          {severity.isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <SeverityDonutChart data={severity.data ?? []} />
          )}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Top Issue Categories
          </h2>
          {categories.isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <TopCategoriesChart data={categories.data ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): add analytics DashboardPage with stat cards and charts"
```

---

### Task F7: ReviewsPage and RepositoriesPage

**Files:**

- Create: `packages/dashboard/src/pages/ReviewsPage.tsx`
- Create: `packages/dashboard/src/pages/RepositoriesPage.tsx`

- [ ] **Step 1: Create `packages/dashboard/src/pages/ReviewsPage.tsx`**

```tsx
import { useState } from "react";
import { ReviewDetail } from "../components/ReviewDetail";
import { ReviewList } from "../components/ReviewList";

export function ReviewsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <ReviewDetail reviewId={selectedId} onBack={() => setSelectedId(null)} />
    );
  }
  return <ReviewList onSelect={setSelectedId} />;
}
```

- [ ] **Step 2: Create `packages/dashboard/src/pages/RepositoriesPage.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Repo {
  id: string;
  full_name: string;
  default_branch: string;
  is_active: boolean;
  created_at: string;
}

async function fetchRepos(): Promise<Repo[]> {
  const key = localStorage.getItem("argus_api_key") ?? "";
  const res = await fetch(`${BASE}/api/v1/repositories`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error("Failed to fetch repositories");
  return res.json();
}

export function RepositoriesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["repositories"],
    queryFn: fetchRepos,
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          All monitored repositories
        </p>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-400 text-sm">Failed to load repositories.</p>
      )}

      {data && data.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">
            No repositories yet. Trigger a webhook to register one.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Repository
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Default Branch
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {data.map((repo) => (
                <tr
                  key={repo.id}
                  className="hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {repo.full_name}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {repo.default_branch}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        repo.is_active
                          ? "bg-green-500/10 text-green-400"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {repo.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(repo.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/pages/ReviewsPage.tsx packages/dashboard/src/pages/RepositoriesPage.tsx
git commit -m "feat(dashboard): add ReviewsPage and RepositoriesPage"
```

---

### Task F8: Wire React Router and full App redesign

**Files:**

- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Replace `packages/dashboard/src/App.tsx` entirely**

```tsx
import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearStoredApiKey, getStoredApiKey } from "./api/client";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  const [authed, setAuthed] = useState(() => !!getStoredApiKey());

  const handleLogout = () => {
    clearStoredApiKey();
    queryClient.clear();
    setAuthed(false);
  };

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Update ReviewList and ReviewDetail to work on dark background**

The existing components use `bg-gray-50` and white cards. Update `ReviewList.tsx` — change the outer wrapper:

```tsx
// In ReviewList.tsx, change:
<div className="max-w-4xl mx-auto px-4 py-6">
  <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>
// To:
<div className="p-6">
  <div className="mb-6">
    <h1 className="text-2xl font-bold text-white">Reviews</h1>
    <p className="text-sm text-gray-400 mt-0.5">All pull request reviews</p>
  </div>
```

And the card container:

```tsx
// Change:
<div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white shadow-sm">
// To:
<div className="divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-900">
```

And button rows:

```tsx
// Change:
className =
  "w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3";
// To:
className =
  "w-full text-left px-4 py-3 hover:bg-gray-800/50 flex items-center gap-3 transition-colors";
```

And text colors:

```tsx
// Change: text-gray-900 → text-white, text-gray-400 stays
<p className="text-sm font-medium text-white truncate">
<p className="text-xs text-gray-500 mt-0.5">
```

And footer:

```tsx
// Change:
<p className="text-xs text-gray-400 mt-3 text-right">
```

- [ ] **Step 3: Update ReviewDetail.tsx for dark theme**

```tsx
// Change outer wrapper:
<div className="max-w-4xl mx-auto px-4 py-6">
// To:
<div className="p-6">

// Change back button:
className="text-sm text-blue-400 hover:underline mb-4 block"

// Change h1:
className="text-xl font-bold text-white truncate"

// Change sub text:
className="text-sm text-gray-400 mb-6"

// Change section headers:
className="text-sm font-semibold text-gray-300 mb-2"  // Open
className="text-sm font-semibold text-gray-500 mt-6 mb-2"  // Resolved

// Change empty state:
className="text-green-400 font-medium"
```

- [ ] **Step 4: Update FindingCard.tsx for dark theme**

```tsx
// Replace SEVERITY_COLORS with dark variants:
const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-red-500 bg-red-500/10",
  high: "border-orange-400 bg-orange-400/10",
  medium: "border-yellow-400 bg-yellow-400/10",
  low: "border-blue-400 bg-blue-400/10",
  info: "border-gray-600 bg-gray-800",
};

// Change title text:
className = "text-sm font-semibold text-white";

// Change file/line text:
className = "text-xs text-gray-500 mt-0.5";

// Change description text:
className = "text-sm text-gray-300 mt-2";

// Change metadata texts:
className = "text-xs text-gray-400 mt-1";

// Change resolve button:
className =
  "shrink-0 text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 disabled:opacity-50";

// Change resolved badge:
className = "shrink-0 text-xs text-green-400 font-medium";
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Open http://localhost:5173 and verify**

Expected:

- Login page with dark background
- After auth: dark sidebar with Dashboard / Reviews / Repos nav
- Dashboard shows 4 stat cards + 3 charts
- Reviews page shows the review list with dark card styling
- Clicking a review shows detail with dark finding cards
- Repos page shows table of repos
- Sign out clears localStorage and returns to login

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/App.tsx \
        packages/dashboard/src/components/ReviewList.tsx \
        packages/dashboard/src/components/ReviewDetail.tsx \
        packages/dashboard/src/components/FindingCard.tsx
git commit -m "feat(dashboard): wire React Router, dark theme, full multi-page layout"
```

---

## Section G — Docker Dashboard Service

### File Structure

- Create: `packages/dashboard/Dockerfile` — multi-stage: build Vite → serve with nginx
- Create: `packages/dashboard/nginx.conf` — nginx config proxying /api/ to the API service
- Modify: `docker-compose.yml` — add `dashboard` service

---

### Task G1: nginx config

**Files:**

- Create: `packages/dashboard/nginx.conf`

- [ ] **Step 1: Create `packages/dashboard/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy all /api/ and /webhooks/ traffic to the FastAPI backend
    location ~ ^/(api|webhooks)/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # SPA fallback — all other routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/nginx.conf
git commit -m "feat(docker): add nginx config for dashboard with API proxy"
```

---

### Task G2: Dashboard Dockerfile

**Files:**

- Create: `packages/dashboard/Dockerfile`
- Modify: `packages/dashboard/src/api/client.ts` — ensure `VITE_API_URL` defaults to empty string (proxy handles it)

- [ ] **Step 1: Verify `VITE_API_URL` default**

In `packages/dashboard/src/api/client.ts`, the existing line is:

```typescript
const BASE = import.meta.env.VITE_API_URL ?? "";
```

This is already correct — when `VITE_API_URL` is not set (Docker build), `BASE` is `''` and nginx proxies `/api/` requests.

- [ ] **Step 2: Create `packages/dashboard/Dockerfile`**

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/Dockerfile
git commit -m "feat(docker): add multi-stage Dockerfile for dashboard"
```

---

### Task G3: Add dashboard service to docker-compose.yml

**Files:**

- Modify: `docker-compose.yml`

- [ ] **Step 1: Add dashboard service to `docker-compose.yml`**

Add after the `worker` service, before `volumes:`:

```yaml
dashboard:
  build:
    context: packages/dashboard
    dockerfile: Dockerfile
  ports:
    - "3000:80"
  depends_on:
    - api
```

With this setup:

- `http://localhost:3000` serves the React dashboard
- `http://localhost:3000/api/v1/reviews` proxies to the FastAPI backend
- No CORS issues since everything is same-origin through nginx

- [ ] **Step 2: Update `.env` and `docker-compose.yml` CORS**

In `docker-compose.yml`, the `api` service already has `CORS_ORIGINS` coming from `.env`. Add `http://localhost:3000` to `CORS_ORIGINS` in `.env`:

```
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000","http://localhost:8000"]
```

- [ ] **Step 3: Build and start the dashboard service**

```bash
docker compose build dashboard && docker compose up -d dashboard
```

- [ ] **Step 4: Verify**

```bash
curl -s http://localhost:3000 | grep -o '<title>.*</title>'
```

Expected: `<title>Argus</title>` (or similar Vite default title).

Open http://localhost:3000 in browser. Expected: Argus login page served by nginx.

```bash
curl -s http://localhost:3000/api/v1/auth/verify \
  -H "Authorization: Bearer argus-dev-key-change-in-prod"
```

Expected: `{"status":"ok"}` (proxied through nginx to FastAPI).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env
git commit -m "feat(docker): add dashboard service to docker-compose with nginx proxy"
```

---

## Self-Review

**Spec coverage:**

- [x] Auth: API key in Settings, `require_api_key` dependency, all `/api/v1/` routes protected, webhooks exempt, verify endpoint, login page, localStorage persistence — Tasks E1–E3
- [x] Analytics API: 4 endpoints (overview, score-trend, severity-breakdown, top-categories) — Task F1
- [x] Analytics types + client — Task F2
- [x] StatCard component — Task F3
- [x] 3 Recharts chart components — Task F4
- [x] Dark sidebar AppShell — Task F5
- [x] DashboardPage with cards + charts — Task F6
- [x] ReviewsPage + RepositoriesPage — Task F7
- [x] React Router wiring + dark theme throughout — Task F8
- [x] nginx config — Task G1
- [x] Dashboard Dockerfile — Task G2
- [x] docker-compose dashboard service — Task G3

**Placeholder scan:** None found. All steps have full code.

**Type consistency:**

- `OverviewStats`, `ScorePoint`, `SeverityCount`, `CategoryCount` defined in Task F2 types and used consistently in F6 charts
- `analyticsApi.*` methods defined in Task F2 and called in Task F6
- `AppShell` `onLogout` prop defined in F5 and passed in F8
- `LoginPage` `onSuccess` prop defined in E3 and used in F8
- `clearStoredApiKey`, `getStoredApiKey`, `setStoredApiKey` defined in E3's `client.ts` and used in F8's `App.tsx`
