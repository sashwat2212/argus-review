# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**argus-review** is a multi-agent AI code review engine designed to analyze pull requests and suggest improvements across code quality and security dimensions.

**Status**: v1 complete with core review engine, CLI, FastAPI backend, Celery workers, and React dashboard.

**Key Components**:
- **packages/core**: LangGraph-based multi-agent pipeline (quality + security agents + synthesis deduplication)
- **packages/cli**: Typer CLI for local review, GitHub PR integration, and SQLite history
- **packages/api**: FastAPI backend with async PostgreSQL, Redis Celery workers, GitHub webhook receiver
- **packages/dashboard**: Vite + React + Tailwind dashboard for reviewing findings and analytics

## Development Setup

### Prerequisites
- Python 3.11+
- Node 20+
- Docker & Docker Compose (for local PostgreSQL, Redis, Ollama)
- `uv` package manager

### Installation

```bash
# Install Python dependencies
uv sync

# Install dashboard dependencies
cd packages/dashboard && npm install && cd ../..

# Set up environment
cp .env.example .env
# Edit .env to configure LLM backend, database URLs, GitHub tokens
```

### Running Locally

```bash
# Option 1: Docker Compose (recommended for first-time setup)
docker compose up -d
# Then run migrations: docker compose exec api alembic upgrade head

# Option 2: Local development
# Terminal 1 - API server
uv run uvicorn argus_api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Celery worker
uv run celery -A argus_api.tasks.celery_app worker --loglevel=info

# Terminal 3 - Dashboard dev server
cd packages/dashboard && npm run dev  # http://localhost:5173
```

## Development Commands

### Testing
```bash
# Run all tests
uv run pytest packages/core/tests/ -v

# Run specific test
uv run pytest packages/core/tests/test_engine.py::test_compute_score_critical -v

# With coverage
uv run pytest packages/core/tests/ --cov=argus_core
```

### Linting & Type Checking
```bash
# Lint
uv run ruff check packages/

# Fix lint issues
uv run ruff check --fix packages/

# Type check
uv run mypy packages/core/argus_core packages/cli/argus_cli packages/api/argus_api
```

### CLI Quick Start
```bash
# Initialize config interactively
uv run argus init

# Review a local file
uv run argus review --file packages/core/argus_core/engine.py

# Review a PR
uv run argus review --pr 42 --repo owner/repo

# View history
uv run argus history

# View/edit config
uv run argus config
```

## Architecture

### Multi-Agent Pipeline (LangGraph)

```
Input (unified diff)
       ↓
Quality Agent (detects complexity, dead code, error handling issues, etc.)
       ↓
Security Agent (detects injection, secrets, weak crypto, XSS, etc.)
       ↓
Synthesis Agent (deduplicates findings, sorts by severity/confidence)
       ↓
Output (ReviewResult with findings, score, errors)
```

**Key Design**:
- Sequential in v1; parallel execution possible via LangGraph `Send` API in v2
- JSON-mode LLM responses for deterministic parsing
- Confidence thresholds: quality ≥0.5, security ≥0.6
- Severity deductions: critical -25, high -10, medium -4, low -2, info 0 (out of 100)

### Database Schema (PostgreSQL)

- `organizations`: GitHub orgs, for multi-tenant support
- `users`: GitHub logins linked to orgs
- `repositories`: GitHub repos with webhook config
- `reviews`: PR review records with status (pending/running/completed/failed)
- `findings`: Individual code findings with file/line/severity/confidence

### API Structure

- `GET /health`: Liveness check
- `POST /webhooks/github`: GitHub webhook receiver (HMAC verified, idempotent via Redis)
- `GET /api/v1/reviews`: List reviews (paginated, filterable by status)
- `GET /api/v1/reviews/{id}`: Get review with findings
- `PATCH /api/v1/reviews/{id}/findings/{fid}`: Mark finding as resolved

### Celery Task

`run_review_task(review_id, pr_diff_url, head_sha, repo_full_name)`:
1. Fetch diff from GitHub API
2. Run ReviewEngine with configured LLM backend (Ollama or Anthropic)
3. Bulk-insert findings into PostgreSQL
4. Post inline PR comments + summary + commit status to GitHub
5. Retry up to 3 times on failure with 60s backoff

### LLM Backend Selection

Auto-detection: if `ANTHROPIC_API_KEY` is set in environment, use Claude Sonnet 4.6 (Anthropic). Otherwise default to Ollama with CodeLlama 13B.

Environment variable `ARGUS_LLM_BACKEND` can explicitly override to `"ollama"` or `"anthropic"`.

## Important Notes

### Code Quality Standards

- **Type hints**: Required for all public functions (mypy in CI)
- **Error handling**: Use structured logging, never swallow exceptions in agents
- **Async/await**: Core engine and API use async/await throughout; Celery tasks wrap async code with `asyncio.run()`
- **Database sessions**: New `AsyncSessionLocal()` context per Celery task (never share async sessions across `asyncio.run()` calls)
- **Finding confidence**: Always validate confidence is 0.0–1.0 range in LLM parsing

### Common Workflows

#### Adding a New Agent
1. Create `packages/core/argus_core/agents/foo_agent.py` with `async def run_foo_agent(state, llm) -> dict`
2. Create prompt in `packages/core/argus_core/prompts/foo.py` with system + human templates
3. Update `packages/core/argus_core/graph.py` to add node and edge
4. Update `ReviewState` TypedDict if new state keys needed

#### Testing a Diff Locally
```bash
# Create a test diff file
cat > test.diff <<EOF
diff --git a/example.py b/example.py
index abc..def 100644
--- a/example.py
+++ b/example.py
@@ -1,3 +1,5 @@
+import os
+secret = os.environ['AWS_KEY']  # Hardcoded secret!
 def foo():
     pass
EOF

# Review it
uv run argus review --file test.diff
```

#### Running Review via Webhook (Docker)
```bash
# Start services
docker compose up -d

# Trigger by POST to http://localhost:8000/webhooks/github with GitHub webhook payload
curl -X POST http://localhost:8000/webhooks/github \
  -H "X-Hub-Signature-256: sha256=<HMAC>" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -d '{"action":"opened","pull_request":{...}}'
```

## External Dependencies

- **LangGraph**: Stateful graph orchestration for multi-step agent pipelines
- **LangChain**: Unified LLM interface (Ollama, Anthropic, others)
- **FastAPI**: Async web framework for API
- **SQLAlchemy**: ORM with async support
- **Celery + Redis**: Distributed task queue for async reviews
- **Alembic**: Database migrations
- **Rich**: Terminal UI (tables, panels, syntax highlighting)
- **Typer**: CLI framework
- **React Query + Recharts**: Frontend state management and charts

## Documentation

- `docs/self-hosting.md`: Complete Docker, webhook, and CLI setup guide
- This file (`CLAUDE.md`): Development guidelines and architecture
- Code docstrings: Present for complex functions; absent for obvious code

## Deployment & CI

- **GitHub Actions**: 
  - `ci.yml`: Runs pytest, ruff, mypy on every push and PR
  - `code-review.yml`: Reusable workflow that reviews PRs using Anthropic Claude
- **Docker**: Multi-stage builds in `packages/api/Dockerfile` with `uv sync` caching
- **Database**: Async SQLAlchemy + asyncpg; migrations via Alembic on container startup

## Known Limitations (v1)

- Sequential agent execution (no parallelism yet)
- No user authentication on API (add JWT/OAuth before production)
- Findings deduplication is line-range-based bucketing (not semantic)
- No rate limiting on API endpoints
- Ollama model must be pre-pulled manually or via container init
