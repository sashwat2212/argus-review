# Argus E2E Testing Guide

This guide walks through **every layer** of the Argus stack from infrastructure up to the browser. Work through the sections in order — each builds on the previous one.

---

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] Docker Desktop running
- [ ] `.env` file at the project root (copy `.env` from the existing file or create from scratch below)
- [ ] Python 3.11+ and `uv` installed
- [ ] Node 20+ and `npm` installed
- [ ] `ngrok` installed (for GitHub webhook testing — Section 6 only)
- [ ] A GitHub OAuth App (for auth testing — Section 4)

### Required `.env` values

```env
# Database / Redis
DATABASE_URL=postgresql+asyncpg://argus:argus_dev@localhost:5432/argus
REDIS_URL=redis://localhost:6380/0

# Auth
SECRET_KEY=super-secret-dev-key-change-in-prod
ARGUS_API_KEY=argus-dev-key

# GitHub OAuth App (create at https://github.com/settings/developers)
GITHUB_CLIENT_ID=<your_oauth_app_client_id>
GITHUB_CLIENT_SECRET=<your_oauth_app_client_secret>

# GitHub Webhooks
GITHUB_TOKEN=<your_github_pat_with_repo_scope>
GITHUB_WEBHOOK_SECRET=argus-webhook-secret-dev

# LLM Backend — pick one:
ARGUS_LLM_BACKEND=ollama         # local, free, slower
# ARGUS_LLM_BACKEND=anthropic    # cloud, fast, costs money
ANTHROPIC_API_KEY=                # leave blank if using ollama
ARGUS_ANTHROPIC_MODEL=claude-haiku-4-5

# CORS
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000","http://localhost:8000"]
```

> **GitHub OAuth App setup:** Go to https://github.com/settings/developers → **New OAuth App**
> - Application name: `Argus Dev`
> - Homepage URL: `http://localhost:3000`
> - Authorization callback URL: `http://localhost:8000/api/v1/auth/github/callback`

---

## Section 1 — Infrastructure (Docker Services)

> [!IMPORTANT]
> **Docker Desktop must be running first.** Open Docker Desktop from the Start menu and wait until the whale icon in the taskbar is **steady** (not animated). Also confirm it's in **Linux containers** mode — right-click the tray icon; if you see "Switch to Linux containers...", click it first.

### 1.1 Start all services

Pick the backend that matches your `.env`:

**Option A — Anthropic (recommended, no Ollama needed):**
```powershell
cd "C:\Users\Sashwat Sinha\Documents\argus-review"
# Make sure ARGUS_LLM_BACKEND=anthropic in .env
docker compose up -d postgres redis
```

**Option B — Ollama (local, slower, no API key needed):**
```powershell
cd "C:\Users\Sashwat Sinha\Documents\argus-review"
# Make sure ARGUS_LLM_BACKEND=ollama in .env
docker compose up -d postgres redis ollama
# Note: Ollama will pull qwen2.5-coder:3b on first start (~2GB, may take a few minutes)
```

### 1.2 Verify Postgres is ready

```powershell
docker compose exec postgres pg_isready -U argus
```
**Expected:** `localhost:5432 - accepting connections`

### 1.3 Verify Redis is ready

```powershell
docker compose exec redis redis-cli ping
```
**Expected:** `PONG`

### 1.4 Run database migrations

```powershell
uv run alembic upgrade head
```
**Expected:** Lines like `Running upgrade ... -> ..., <migration name>` with no errors.

If you get `Target database is not up to date`, the migrations ran fine and the DB is already current.

### 1.5 Verify schema was created

```powershell
docker compose exec postgres psql -U argus -d argus -c "\dt"
```
**Expected:** Table list including `organizations`, `users`, `repositories`, `reviews`, `findings`.

---

## Section 2 — Backend API (Unit + Integration)

### 2.1 Run the automated test suite

```powershell
uv run pytest packages/core/tests/ packages/api/tests/ -v --tb=short --no-header
```
**Expected:** All tests pass (green). Note the count — we'll come back to this.

### 2.2 Run linting

```powershell
uv run ruff check packages/
uv run ruff format --check packages/
```
**Expected:** No errors.

### 2.3 Run type checking

```powershell
uv run mypy packages/core/argus_core packages/api/argus_api
```
**Expected:** `Success: no issues found in X source files`.

---

## Section 3 — API Server (Manual HTTP Verification)

### 3.1 Start the API server

```powershell
# Terminal 1
uv run uvicorn argus_api.main:app --reload --host 0.0.0.0 --port 8000
```
**Expected:** `Application startup complete.` with no errors.

### 3.2 Health check

```powershell
curl http://localhost:8000/health
```
**Expected:** `{"status":"ok"}` (HTTP 200)

### 3.3 Prometheus metrics endpoint

```powershell
curl http://localhost:8000/metrics | Select-String "http_requests"
```
**Expected:** Lines of Prometheus metric output.

### 3.4 OpenAPI docs

Open http://localhost:8000/docs in your browser.

**Expected:** Interactive Swagger UI showing all routes:
- `/health`
- `/api/v1/auth/*`
- `/api/v1/reviews/*`
- `/api/v1/repositories/*`
- `/api/v1/analytics/*`
- `/webhooks/github`
- `/metrics`

### 3.5 Verify auth protects routes

```powershell
# Should return 401 with no cookie/token
curl -s http://localhost:8000/api/v1/reviews | python -m json.tool
```
**Expected:** `{"detail":"Not authenticated"}` (HTTP 401)

```powershell
# Should return 401 with wrong API key
curl -s http://localhost:8000/api/v1/auth/verify `
  -H "Authorization: Bearer wrong-key" | python -m json.tool
```
**Expected:** `{"detail":"Invalid or missing API key"}` (HTTP 401)

```powershell
# Should return 200 with correct API key
curl -s http://localhost:8000/api/v1/auth/verify `
  -H "Authorization: Bearer argus-dev-key" | python -m json.tool
```
**Expected:** `{"status":"ok"}` (HTTP 200)

---

## Section 4 — GitHub OAuth Login Flow

> **Requires:** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set in `.env` and the API server restarted after setting them.

### 4.1 Trigger the GitHub OAuth redirect

Open in your browser:
```
http://localhost:8000/api/v1/auth/github/login
```
**Expected:** You are redirected to `https://github.com/login/oauth/authorize?client_id=...`

### 4.2 Complete GitHub authorization

- Click **Authorize** on the GitHub page.
- You will be redirected back to `http://localhost:8000/api/v1/auth/github/callback?code=...`
- The API exchanges the code for a token, upserts your user + organization in the DB, creates a JWT, sets an `argus_session` HTTPOnly cookie, and redirects you to `http://localhost:5173` (or `localhost:3000`).

**Expected:** Browser ends up at the frontend URL. If the frontend isn't running yet, you'll get a connection error — that's fine. Check the API logs.

### 4.3 Verify user was created in the database

```powershell
docker compose exec postgres psql -U argus -d argus `
  -c "SELECT github_login, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 1;"
```
**Expected:** Your GitHub login appears in the row.

### 4.4 Verify the JWT cookie

In your browser DevTools → Application → Cookies → `localhost:8000`:
- Cookie name: `argus_session`
- HTTPOnly: ✅
- Value: a JWT string (`eyJ...`)

### 4.5 Test authenticated API call via cookie

After step 4.2, your browser has the cookie. Open:
```
http://localhost:8000/api/v1/auth/me
```
**Expected:** JSON with your GitHub profile:
```json
{
  "id": "...",
  "github_login": "sashwat2212",
  "email": "...",
  "role": "owner",
  "org_id": "..."
}
```

### 4.6 Test logout

```powershell
curl -s -X POST http://localhost:8000/api/v1/auth/logout `
  --cookie "argus_session=<paste_your_jwt>" | python -m json.tool
```
**Expected:** `{"status":"logged out"}` and the cookie is cleared (Set-Cookie header with `Max-Age=0`).

---

## Section 5 — Analytics API Endpoints

> **Requires:** API server running, logged in (cookie set from Section 4). All 10 analytics endpoints use `get_current_user` — they need the JWT cookie, not the API key.

For convenience, export your cookie:
```powershell
$COOKIE = "argus_session=<paste_your_jwt_here>"
```

### 5.1 Overview stats
```powershell
curl -s http://localhost:8000/api/v1/analytics/overview `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** 
```json
{
  "total_reviews": 0,
  "completed_reviews": 0,
  "avg_score": null,
  "pass_rate": null,
  "open_findings": 0,
  "total_findings": 0
}
```
(Zeros are correct if no reviews exist yet — you'll see real numbers after Section 6.)

### 5.2 Score trend
```powershell
curl -s "http://localhost:8000/api/v1/analytics/score-trend?limit=30" `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]` (empty array if no completed reviews yet)

### 5.3 Severity breakdown
```powershell
curl -s http://localhost:8000/api/v1/analytics/severity-breakdown `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]`

### 5.4 Top categories
```powershell
curl -s http://localhost:8000/api/v1/analytics/top-categories `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]`

### 5.5 Repository health
```powershell
curl -s http://localhost:8000/api/v1/analytics/repository-health `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]`

### 5.6 Agent breakdown
```powershell
curl -s http://localhost:8000/api/v1/analytics/agent-breakdown `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]`

### 5.7 Finding velocity
```powershell
curl -s "http://localhost:8000/api/v1/analytics/finding-velocity?days=14" `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** Array of 14 date entries, all with `"opened": 0, "resolved": 0`

### 5.8 Score distribution
```powershell
curl -s http://localhost:8000/api/v1/analytics/score-distribution `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** 5 band entries, all `"count": 0`

### 5.9 Top files
```powershell
curl -s "http://localhost:8000/api/v1/analytics/top-files?limit=10" `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `[]`

### 5.10 Review duration
```powershell
curl -s http://localhost:8000/api/v1/analytics/review-duration `
  --cookie $COOKIE | python -m json.tool
```
**Expected:** `{"avg_seconds": null, "min_seconds": null, "max_seconds": null}`

---

## Section 6 — Celery Worker + GitHub Webhook Integration

> **Requires:** All of the above working, plus `ngrok` for live GitHub webhook delivery.

### 6.1 Start the Celery worker

```powershell
# Terminal 2
uv run celery -A argus_api.tasks.celery_app worker --loglevel=info --concurrency=2
```
**Expected:** `celery@<hostname> ready.` with no errors.

### 6.2 Start ngrok tunnel

```powershell
# Terminal 3
ngrok http 8000
```
Note your forwarding URL, e.g. `https://abcd-12-34-56-78.ngrok-free.app`

### 6.3 Register a GitHub webhook on your repo

1. Go to `https://github.com/sashwat2212/argus-review` → **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://<your-ngrok-url>/webhooks/github`
3. **Content type:** `application/json`
4. **Secret:** Same value as `GITHUB_WEBHOOK_SECRET` in your `.env` (`argus-webhook-secret-dev`)
5. **Events:** Select "Pull requests" only
6. **Active:** ✅ → Save

### 6.4 Trigger a test review via manual webhook

```powershell
# PowerShell — generate HMAC-SHA256 signature and POST
$WEBHOOK_SECRET = "argus-webhook-secret-dev"
$PAYLOAD = '{"action":"opened","pull_request":{"number":999,"title":"Test PR - Security Issues","url":"https://api.github.com/repos/sashwat2212/argus-review/pulls/999","base":{"sha":"abc123"},"head":{"sha":"def456"},"body":"Test body"},"repository":{"id":123456,"full_name":"sashwat2212/argus-review","owner":{"login":"sashwat2212"},"default_branch":"main"}}'

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($WEBHOOK_SECRET)
$hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($PAYLOAD))
$SIGNATURE = "sha256=" + (($hash | ForEach-Object { "{0:x2}" -f $_ }) -join "")

$DELIVERY_ID = [System.Guid]::NewGuid().ToString()

Invoke-RestMethod -Uri "http://localhost:8000/webhooks/github" `
  -Method POST `
  -Headers @{
    "X-Hub-Signature-256" = $SIGNATURE
    "X-GitHub-Event"      = "pull_request"
    "X-GitHub-Delivery"   = $DELIVERY_ID
    "Content-Type"        = "application/json"
  } `
  -Body $PAYLOAD
```
**Expected:** `{"status":"queued","review_id":"...","task_id":"..."}`

### 6.5 Verify task is picked up by Celery

Watch Terminal 2 (Celery worker logs). **Expected within 5 seconds:**
```
[INFO] Task argus_api.tasks.run_review_task[<id>] received
[INFO] Starting review for PR ...
```

### 6.6 Check review status in the database

```powershell
docker compose exec postgres psql -U argus -d argus `
  -c "SELECT id, pr_number, status, score FROM reviews ORDER BY created_at DESC LIMIT 3;"
```

### 6.7 Verify duplicate delivery is rejected

Send the same `$DELIVERY_ID` again:
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/webhooks/github" `
  -Method POST `
  -Headers @{
    "X-Hub-Signature-256" = $SIGNATURE
    "X-GitHub-Event"      = "pull_request"
    "X-GitHub-Delivery"   = $DELIVERY_ID
    "Content-Type"        = "application/json"
  } `
  -Body $PAYLOAD
```
**Expected:** `{"status":"duplicate","delivery":"..."}`

### 6.8 Verify invalid signature is rejected

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/webhooks/github" `
  -Method POST `
  -Headers @{
    "X-Hub-Signature-256" = "sha256=0000000000000000000000000000000000000000000000000000000000000000"
    "X-GitHub-Event"      = "pull_request"
    "X-GitHub-Delivery"   = [System.Guid]::NewGuid().ToString()
    "Content-Type"        = "application/json"
  } `
  -Body $PAYLOAD
```
**Expected:** HTTP 401 `{"detail":"Invalid webhook signature"}`

### 6.9 Trigger a real PR review via GitHub

```powershell
git checkout -b test/e2e-security-check
@"
import os, requests

AWS_KEY = "AKIA1234567890ABCDEF"  # hardcoded secret
resp = requests.get("https://api.example.com", verify=False)  # SSL disabled
user_id = input("ID: ")
query = f"SELECT * FROM users WHERE id = {user_id}"  # SQL injection
"@ | Set-Content test_security.py

git add test_security.py
git commit -m "test: e2e security check"
git push origin test/e2e-security-check
```

Then open a PR on GitHub against `main`. **Expected within 30–60 seconds:**
- GitHub shows a ⏳ **pending** commit status labeled `argus/code-review`
- PR review comment appears with a score table and severity-tagged findings
- Commit status updates to ✅ (score ≥ 70) or ❌ (score < 70)

### 6.10 Verify findings in the database

```powershell
docker compose exec postgres psql -U argus -d argus `
  -c "SELECT file_path, severity, category, title FROM findings WHERE review_id = (SELECT id FROM reviews ORDER BY created_at DESC LIMIT 1) LIMIT 5;"
```

---

## Section 7 — CLI

### 7.1 Review a local diff file

```powershell
uv run argus review --file test.diff
```
**Expected:** Terminal output with a findings table and score.

### 7.2 Review a GitHub PR

```powershell
uv run argus review --pr 1 --repo sashwat2212/argus-review
```
**Expected:** Review result with findings.

### 7.3 Check review history

```powershell
uv run argus history
```
**Expected:** Table of past reviews with scores.

---

## Section 8 — Dashboard UI

### 8.1 Start dashboard dev server

```powershell
# Terminal 4
cd packages\dashboard
npm run dev
```
**Expected:** `Local: http://localhost:5173/` with no TypeScript errors.

### 8.2 Login page

Open http://localhost:5173 in your browser.

**Expected:**
- Dark background (`bg-slate-950`)
- Left panel: Argus logo + "Continue with GitHub" button
- Right panel: Animated boot log terminal
- No console errors

### 8.3 Complete GitHub login

Click **Continue with GitHub**. You'll be redirected to GitHub, authorize, and land back at the dashboard.

**Expected:**
- Dark sidebar with three nav items: 📊 Dashboard, 🔍 Reviews, 📁 Repos
- Dashboard page loads with stat cards (initially all zeros)
- No 401 errors in browser console

### 8.4 Dashboard page — stat cards

Navigate to `/` (Dashboard):

**Expected 4 stat cards:**
- Total Reviews
- Avg Score
- Pass Rate
- Open Findings

All show `—` or `0` if no data yet. Charts show "No completed reviews yet."

### 8.5 Reviews page

Navigate to `/reviews`:

**Expected:**
- Dark table/list of reviews
- If no reviews: empty state message
- If reviews exist (from Section 6): list of PR reviews with status badges

Click a review row to open the detail view.

**Expected:**
- Review detail with score, PR title, and findings list
- Findings grouped by open vs. resolved
- "Mark as resolved" button on each open finding

### 8.6 Mark a finding as resolved

Click **Resolve** on any open finding.

**Expected:**
- Finding moves from "Open" to "Resolved" section
- `PATCH /api/v1/reviews/{id}/findings/{fid}` call in Network tab → 200 response

### 8.7 Repositories page

Navigate to `/repositories`:

**Expected:**
- Table of monitored repos with columns: Repository, Default Branch, Status, Added
- If no repos: "No repositories yet. Trigger a webhook to register one."

### 8.8 Sign out

Click **🚪 Sign out** in the sidebar footer.

**Expected:**
- `POST /api/v1/auth/logout` fires → 200
- `argus_session` cookie is cleared
- Redirect back to the login page

### 8.9 TypeScript type check

```powershell
cd packages\dashboard
npx tsc --noEmit
```
**Expected:** No errors.

---

## Section 9 — Dockerized Stack (Full Production Simulation)

### 9.1 Build all Docker images

```powershell
cd C:\Users\Sashwat Sinha\Documents\argus-review
docker compose build
```
**Expected:** All images build without errors. Dashboard image takes longest (Vite build).

### 9.2 Start full stack

```powershell
docker compose up -d
```

### 9.3 Run migrations inside the container

```powershell
docker compose exec api alembic upgrade head
```

### 9.4 Verify all containers are healthy

```powershell
docker compose ps
```
**Expected:** All services show `Up` or `healthy`:
- `postgres` — healthy
- `redis` — healthy
- `ollama` — running (takes a few minutes to pull the model)
- `api` — running on port 8000
- `worker` — running
- `dashboard` — running on port 3000

### 9.5 Health check via containerized API

```powershell
curl http://localhost:8000/health
```
**Expected:** `{"status":"ok"}`

### 9.6 Dashboard served by nginx

Open http://localhost:3000 in your browser.

**Expected:**
- Argus login page served by nginx
- No 404 or 502 errors

### 9.7 API proxy through nginx

```powershell
curl -s http://localhost:3000/api/v1/auth/verify `
  -H "Authorization: Bearer argus-dev-key" | python -m json.tool
```
**Expected:** `{"status":"ok"}` — the request was proxied from nginx → API container.

### 9.8 SPA fallback (React Router)

Open http://localhost:3000/reviews in a new tab.

**Expected:** Login page loads (not a 404). nginx serves `index.html` for all non-API routes.

---

## Section 10 — CI Validation

### 10.1 Verify CI workflow locally (optional)

```powershell
# Lint — same as CI job 1
uv run ruff check packages/
uv run ruff format --check packages/

# Tests — same as CI job 2
$env:DATABASE_URL = "postgresql+asyncpg://argus:argus_dev@localhost:5432/argus"
$env:SECRET_KEY = "ci-secret-key"
$env:GITHUB_CLIENT_ID = "ci-placeholder"
$env:GITHUB_CLIENT_SECRET = "ci-placeholder"
uv run pytest packages/core/tests/ packages/api/tests/ -v --tb=short --no-header

# Dashboard build — same as CI job 3
cd packages\dashboard
npm ci
npm run type-check
npm run build
```

---

## Quick Smoke Test Checklist

Use this for fast re-verification after any code change:

| # | Check | Command / Action | Expected |
|---|---|---|---|
| 1 | Postgres up | `docker compose exec postgres pg_isready -U argus` | `accepting connections` |
| 2 | Redis up | `docker compose exec redis redis-cli ping` | `PONG` |
| 3 | API health | `curl localhost:8000/health` | `{"status":"ok"}` |
| 4 | Auth verify (API key) | `curl localhost:8000/api/v1/auth/verify -H "Authorization: Bearer argus-dev-key"` | `{"status":"ok"}` |
| 5 | Auth blocks unauthenticated | `curl localhost:8000/api/v1/reviews` | HTTP 401 |
| 6 | GitHub OAuth login | Browser → `localhost:8000/api/v1/auth/github/login` | Redirects to GitHub |
| 7 | Analytics overview | `curl localhost:8000/api/v1/analytics/overview --cookie argus_session=...` | JSON with stats |
| 8 | Celery worker | Webhook POST → check worker logs | `run_review_task received` |
| 9 | Dashboard login page | Browser → `localhost:5173` | Login page renders |
| 10 | Dashboard after login | Navigate to `/` | Stat cards render |
| 11 | Reviews page | Navigate to `/reviews` | Reviews table renders |
| 12 | Repos page | Navigate to `/repositories` | Repos table renders |
| 13 | TypeScript check | `cd packages/dashboard && npx tsc --noEmit` | No errors |
| 14 | Ruff lint | `uv run ruff check packages/` | No errors |

---

## Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Connection refused` on port 8000 | API not started | Run `uv run uvicorn argus_api.main:app --reload --port 8000` |
| `alembic upgrade head` fails with `relation does not exist` | Missing migration | Run `uv run alembic revision --autogenerate -m "add missing tables"` then upgrade |
| Login redirects to GitHub but callback returns 400 | Wrong callback URL in OAuth App settings | Set callback URL to exactly `http://localhost:8000/api/v1/auth/github/callback` |
| Cookie not set after GitHub OAuth | Mismatched `cors_origins` or `secure=True` in local env | Ensure `secure=False` in `auth.py` cookie for local dev |
| Celery worker shows `PENDING` forever | Redis not accessible | Check `REDIS_URL` in `.env` matches docker-compose port mapping (`6380:6379`) |
| Dashboard shows blank page | Vite proxy config or CORS | Check `CORS_ORIGINS` in `.env` includes `http://localhost:5173` |
| `ModuleNotFoundError` in API | uv venv not activated or packages not installed | Run `uv sync` |
| ngrok webhook returns 502 | API server not running or wrong port | Ensure API is on port 8000 and ngrok targets `ngrok http 8000` |
| Ollama model not found | Model wasn't pulled | Run `docker compose exec ollama ollama pull qwen2.5-coder:3b` |
