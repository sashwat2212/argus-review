# DevOps Architecture & Experience: argus-review

This document describes the DevOps setup, CI/CD pipelines, testing strategies, deployment workflows, and version control policies established for the **argus-review** repository.

---

## 1. CI/CD Pipelines (GitHub Actions)

The repository uses GitHub Actions for automation, split into three dedicated workflows located in [.github/workflows/](file:///c:/Users/Sashwat%20Sinha/Documents/argus-review/.github/workflows):

### A. Continuous Integration (`ci.yml`)
Triggers on any push or pull request targeting the `main` branch. It runs four concurrent or dependent jobs to validate code health:
1. **Lint & Format**: Sets up Python 3.11, caches the `uv` virtual environment, installs dependencies via `uv sync`, and runs `ruff check` and `ruff format --check` over Python packages.
2. **Backend Tests**: Spins up a PostgreSQL 16 Alpine service container for integration testing. Caches `uv` dependencies, runs `uv sync`, and executes the backend test suite via `pytest` (`packages/core/tests/` and `packages/api/tests/`).
3. **Build Dashboard**: Sets up Node 20, caches npm dependencies, performs a TypeScript type check (`npm run type-check`), compiles the Vite/React frontend (`npm run build`), and uploads the production bundle (`dist/`) as a workflow artifact.
4. **Build & Push API Docker Image**: Triggered only after tests and frontend build succeed. Authenticates with GitHub Container Registry (GHCR), extracts image tags based on git reference (branch, PR, SHA), builds the multi-stage API Docker image using Buildx, and pushes it to GHCR (with caching via GitHub Actions cache backend).

### B. Continuous Deployment (`cd.yml`)
Deploys the application to the production environment when code merges into `main` or when triggered manually via `workflow_dispatch`.
1. **Deployment Lock & Environment Gate**: Configured with the `production` environment, requiring manual reviewer approval on GitHub before execution.
2. **Configuration Delivery**: Generates a production-ready `.env.production` file using secrets fetched from GitHub Secrets.
3. **File Transfer**: Uses `appleboy/scp-action` to transfer `docker-compose.yml` and `.env.production` to the server's deployment directory (`~/argus`).
4. **Remote Execution (SSH)**: Connects to the host server via `appleboy/ssh-action` to:
   - Log into GHCR.
   - Pull the updated Docker images for the API and Celery worker.
   - Boot database (`postgres`) and cache (`redis`) services.
   - Execute database migrations via Alembic inside the API container wrapper.
   - Recreate API and Celery worker containers without downtime (rolling container restart).
   - Prune obsolete Docker images to save space.
5. **Post-Deploy Health Check**: Waits for 20 seconds, then queries the `/api/v1/health` endpoint on the production host. If it returns anything other than HTTP 200, the pipeline marks the deployment job as failed.

### C. Self-Hosted Code Review Pipeline (`code-review.yml`)
An automated code quality gate that utilizes the project's own product to review incoming pull requests:
- Runs when PRs are opened, updated, or reopened.
- Installs `argus-cli` directly from the PR branch.
- Sets a pending commit status on GitHub (`argus/code-review`).
- Runs `argus review` using the Anthropic Claude backend to analyze the diff, write inline review comments on the PR, and output a JSON summary.
- Inspects the JSON results to update the GitHub commit status to `success` (score $\ge 70$), `neutral` (score $50\text{--}69$), or `failure` (score $< 50$).

---

## 2. Testing Strategy

The project employs a multi-tiered testing methodology:
- **Linting & Formatting**: Strict style enforcement using `ruff check` and `ruff format` on the backend, alongside TypeScript compiler verification on the dashboard.
- **Backend Testing**: Unit and integration tests written in `pytest`. Tests interact with PostgreSQL database instances using test fixtures and transaction rollbacks to maintain database isolation.
- **Manual Integration Suite**: Described in [TESTING_GITHUB_INTEGRATION.md](file:///c:/Users/Sashwat%20Sinha/Documents/argus-review/TESTING_GITHUB_INTEGRATION.md). It outlines verification checklists for:
  - HMAC webhook signature validation.
  - Redis-based request deduplication (preventing duplicate review tasks).
  - Tunneling local webhooks via `ngrok` to run full integration loops.
  - Verifying the Celery worker task retry policies (up to 3 retries with 60s exponential backoffs).
  - Querying PostgreSQL directly to check database schema consistency post-review.

---

## 3. Deployment & Infrastructure

The production topology is built around lightweight container orchestration:
- **Dockerization**: The API, workers, PostgreSQL, and Redis instances are containerized. The `Dockerfile` uses `uv` for fast, reproducible multi-stage builds.
- **Docker Compose**: Used to run and link Postgres, Redis, the FastAPI application, and Celery task workers.
- **Database Migrations**: Managed via `alembic` (configured with async SQLAlchemy + asyncpg). Migrations run automatically during deployment prior to bringing up the API and worker processes.
- **Observability**: Built-in endpoints like `/health` and `/api/v1/health` verify database and task worker connectivity.

---

## 4. Version Control & Git Workflow

- **Branch Protection**: Recommended settings in [branch-protection.md](file:///c:/Users/Sashwat%20Sinha/Documents/argus-review/docs/branch-protection.md) protect the `main` branch.
- **Merging Criteria**: Merges into `main` require a PR, at least one peer approval, and successful execution of the four status checks: `Lint & Format`, `Backend Tests`, `Build Dashboard`, and `Build & Push API Image`.
- **Review Automation**: Pull requests automatically trigger the self-hosted Argus CLI to scan the PR for vulnerabilities (secrets, SQL injections) and quality issues (complexity, dead code) before human review.
