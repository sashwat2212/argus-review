# GitHub Integration v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing GitHub client into a fully observable end-to-end flow — real PR → webhook → Celery review → inline PR comments → commit status — and add GitHub visibility, PR links, a re-review button, and professional dashboard UI polish.

**Architecture:** Minimal patch approach: one new database column (`github_comment_status`), two backend changes (github_client returns bool, review_task persists result), one new endpoint (`POST /api/v1/reviews/{id}/retry`), and targeted dashboard upgrades (skeleton loaders, toasts, two-panel detail, sortable list, GitHub status badge).

**Tech Stack:** FastAPI, SQLAlchemy + Alembic, Celery, React 18, Tailwind CSS, React Query, ngrok

---

## File Structure

**Backend (create/modify):**
- `packages/api/alembic/versions/0002_add_github_comment_status.py` — migration adding the new column
- `packages/api/argus_api/models/review.py` — add `github_comment_status` field + `repo_full_name` property
- `packages/api/argus_api/schemas/review.py` — add `github_comment_status`, `repo_full_name`, `ReviewRetryOut`
- `packages/api/argus_api/github_client.py` — both posting functions return `bool`
- `packages/api/argus_api/tasks/review_task.py` — persist `github_comment_status` after GitHub calls
- `packages/api/argus_api/routers/reviews.py` — retry endpoint + join repository in list/detail queries
- `packages/api/tests/test_routers.py` — new tests for retry endpoint and github_comment_status
- `packages/api/tests/test_github_client.py` — unit tests for bool return values

**Frontend (create):**
- `packages/dashboard/src/components/Skeleton.tsx` — shimmer placeholder utility
- `packages/dashboard/src/components/Toast.tsx` — toast component + ToastProvider
- `packages/dashboard/src/hooks/useToast.ts` — toast hook
- `packages/dashboard/src/components/GitHubStatusBadge.tsx` — GitHub posting status badge
- `packages/dashboard/src/components/PageTransition.tsx` — 150ms fade wrapper

**Frontend (modify):**
- `packages/dashboard/src/api/types.ts` — add `github_comment_status`, `repo_full_name` to `Review`
- `packages/dashboard/src/api/client.ts` — add `retryReview` function
- `packages/dashboard/src/App.tsx` — wrap with ToastProvider, add PageTransition to routes
- `packages/dashboard/src/layouts/AppShell.tsx` — sidebar live count badges
- `packages/dashboard/src/pages/DashboardPage.tsx` — skeleton loaders
- `packages/dashboard/src/components/ReviewList.tsx` — skeleton, sortable columns, empty state, PR link, GitHub badge
- `packages/dashboard/src/components/ReviewDetail.tsx` — two-panel layout, re-review button, PR link, GitHub badge, skeleton
- `packages/dashboard/src/pages/RepositoriesPage.tsx` — improved empty state + skeleton

---

## Task B1: Migration + Review model `github_comment_status`

**Files:**
- Create: `packages/api/alembic/versions/0002_add_github_comment_status.py`
- Modify: `packages/api/argus_api/models/review.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_routers.py`:

```python
@pytest.mark.asyncio
async def test_review_has_github_comment_status_field():
    from argus_api.database import Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    # Field must be present in schema (null when no reviews exist is fine)
    data = resp.json()
    assert "items" in data
```

- [ ] **Step 2: Run test to verify it passes (it should — existing test)**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review
uv run pytest packages/api/tests/test_routers.py::test_review_has_github_comment_status_field -v
```

Expected: PASS (baseline check)

- [ ] **Step 3: Create the Alembic migration**

Create `packages/api/alembic/versions/0002_add_github_comment_status.py`:

```python
"""Add github_comment_status to reviews

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("github_comment_status", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviews", "github_comment_status")
```

- [ ] **Step 4: Update the Review model**

Replace the entire `packages/api/argus_api/models/review.py` with:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    repo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repositories.id"), nullable=False)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(50), default="webhook")
    pr_number: Mapped[int | None]
    pr_title: Mapped[str | None] = mapped_column(String(500))
    base_sha: Mapped[str | None] = mapped_column(String(40))
    head_sha: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    score: Mapped[int | None]
    total_findings: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    github_comment_status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    repository: Mapped["Repository"] = relationship("Repository", back_populates="reviews")
    triggered_by_user: Mapped["User | None"] = relationship("User", back_populates="triggered_reviews")
    findings: Mapped[list["Finding"]] = relationship("Finding", back_populates="review", cascade="all, delete-orphan")

    @property
    def repo_full_name(self) -> str | None:
        return self.repository.full_name if self.repository else None
```

- [ ] **Step 5: Run existing tests to confirm nothing is broken**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all existing tests PASS

- [ ] **Step 6: Run migration against the dev database**

```bash
uv run alembic upgrade head
```

Expected: `Running upgrade 0001 -> 0002`

- [ ] **Step 7: Commit**

```bash
git add packages/api/alembic/versions/0002_add_github_comment_status.py packages/api/argus_api/models/review.py
git commit -m "feat: add github_comment_status column to reviews"
```

---

## Task B2: `github_client.py` returns bool

**Files:**
- Modify: `packages/api/argus_api/github_client.py`
- Create: `packages/api/tests/test_github_client.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/tests/test_github_client.py`:

```python
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from argus_api.github_client import post_pr_review, set_commit_status
from argus_core.models import Finding


def _make_finding(**kwargs) -> Finding:
    defaults = dict(
        file_path="example.py",
        line_start=1,
        line_end=2,
        severity="high",
        category="error_handling",
        confidence=0.8,
        title="Test finding",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix it",
        agent="quality",
    )
    defaults.update(kwargs)
    return Finding(**defaults)


@pytest.mark.asyncio
async def test_set_commit_status_returns_true_on_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 201

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await set_commit_status(
            token="tok",
            repo_full_name="owner/repo",
            sha="abc123",
            state="success",
            description="Score 85/100",
        )
    assert result is True


@pytest.mark.asyncio
async def test_set_commit_status_returns_false_on_failure():
    mock_resp = MagicMock()
    mock_resp.status_code = 422
    mock_resp.text = "Unprocessable"

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await set_commit_status(
            token="tok",
            repo_full_name="owner/repo",
            sha="abc123",
            state="success",
            description="Score 85/100",
        )
    assert result is False


@pytest.mark.asyncio
async def test_post_pr_review_returns_true_on_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await post_pr_review(
            token="tok",
            repo_full_name="owner/repo",
            pr_number=1,
            commit_id="abc123",
            findings=[_make_finding()],
            score=85,
        )
    assert result is True


@pytest.mark.asyncio
async def test_post_pr_review_returns_false_when_falls_back():
    fail_resp = MagicMock()
    fail_resp.status_code = 422
    fail_resp.text = "Unprocessable"

    fallback_resp = MagicMock()
    fallback_resp.status_code = 201

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[fail_resp, fallback_resp])
        mock_client_cls.return_value = mock_client

        result = await post_pr_review(
            token="tok",
            repo_full_name="owner/repo",
            pr_number=1,
            commit_id="abc123",
            findings=[_make_finding()],
            score=85,
        )
    assert result is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/api/tests/test_github_client.py -v
```

Expected: FAIL — functions currently return `None`, not `bool`

- [ ] **Step 3: Update `github_client.py` to return bool**

Replace the entire `packages/api/argus_api/github_client.py` with:

```python
from __future__ import annotations

import logging
from typing import Literal

import httpx

from argus_core.models import Finding

logger = logging.getLogger(__name__)

GH_API = "https://api.github.com"
CommitState = Literal["pending", "success", "failure", "error"]


async def set_commit_status(
    token: str,
    repo_full_name: str,
    sha: str,
    state: CommitState,
    description: str,
    target_url: str = "",
) -> bool:
    url = f"{GH_API}/repos/{repo_full_name}/statuses/{sha}"
    payload: dict = {
        "state": state,
        "description": description[:140],
        "context": "argus-review",
    }
    if target_url:
        payload["target_url"] = target_url

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers=_headers(token),
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            logger.warning("commit status post failed: %s %s", resp.status_code, resp.text[:200])
            return False
        logger.info("commit status set: %s on %s/%s", state, repo_full_name, sha[:7])
        return True


async def post_pr_review(
    token: str,
    repo_full_name: str,
    pr_number: int,
    commit_id: str,
    findings: list[Finding],
    score: int,
) -> bool:
    summary = _build_summary(findings, score)
    event = "COMMENT"

    inline_comments = []
    for f in findings:
        if f.line_start and f.line_start > 0:
            severity_emoji = _severity_emoji(f.severity)
            body = (
                f"{severity_emoji} **[{f.severity.upper()}] {f.title}**\n\n"
                f"{f.description}\n\n"
                f"**Why it matters:** {f.why_it_matters}\n\n"
                f"**Suggested fix:** {f.suggested_fix}"
            )
            inline_comments.append({
                "path": f.file_path,
                "line": f.line_end if f.line_end else f.line_start,
                "body": body,
            })

    url = f"{GH_API}/repos/{repo_full_name}/pulls/{pr_number}/reviews"
    payload: dict = {
        "commit_id": commit_id,
        "body": summary,
        "event": event,
        "comments": inline_comments,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers=_headers(token),
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            logger.warning("PR review post failed: %s %s", resp.status_code, resp.text[:300])
            await _post_plain_comment(client, token, repo_full_name, pr_number, summary)
            return False
        logger.info("PR review posted: %s#%d score=%d", repo_full_name, pr_number, score)
        return True


async def _post_plain_comment(
    client: httpx.AsyncClient,
    token: str,
    repo_full_name: str,
    pr_number: int,
    body: str,
) -> None:
    url = f"{GH_API}/repos/{repo_full_name}/issues/{pr_number}/comments"
    resp = await client.post(
        url,
        json={"body": body},
        headers=_headers(token),
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        logger.warning("plain comment post failed: %s %s", resp.status_code, resp.text[:200])


def _build_summary(findings: list[Finding], score: int) -> str:
    counts: dict[str, int] = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    score_emoji = "✅" if score >= 80 else "⚠️" if score >= 60 else "❌"
    lines = [
        f"## Argus Review {score_emoji}",
        f"",
        f"**Score: {score}/100** | **{len(findings)} finding(s)**",
        f"",
    ]

    if counts:
        lines.append("| Severity | Count |")
        lines.append("|----------|-------|")
        for sev in ("critical", "high", "medium", "low", "info"):
            if sev in counts:
                lines.append(f"| {_severity_emoji(sev)} {sev.capitalize()} | {counts[sev]} |")
        lines.append("")

    if not findings:
        lines.append("No issues found. Great work! 🎉")
    elif score >= 70:
        lines.append("Minor issues found. Please review the inline comments.")
    else:
        lines.append("Issues require attention before merging.")

    return "\n".join(lines)


def _severity_emoji(severity: str) -> str:
    return {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🔵",
        "info": "ℹ️",
    }.get(severity, "⚪")


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/api/tests/test_github_client.py -v
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/argus_api/github_client.py packages/api/tests/test_github_client.py
git commit -m "feat: github_client functions return bool for success tracking"
```

---

## Task B3: `review_task.py` persists `github_comment_status`

**Files:**
- Modify: `packages/api/argus_api/tasks/review_task.py`

- [ ] **Step 1: Update `_async_run_review` to persist GitHub status**

Replace the entire `packages/api/argus_api/tasks/review_task.py` with:

```python
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from sqlalchemy import select

from argus_api.config import settings
from argus_api.database import AsyncSessionLocal
from argus_api.github_client import post_pr_review, set_commit_status
from argus_api.models.finding import Finding as FindingModel
from argus_api.models.review import Review
from argus_api.tasks.celery_app import celery_app
from argus_core.config import CoreConfig
from argus_core.engine import ReviewEngine

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def run_review_task(
    self,
    review_id: str,
    pr_diff_url: str,
    head_sha: str,
    repo_full_name: str,
) -> None:
    """Fetch diff, run the review engine, persist findings, post GitHub comments."""
    from argus_api.database import engine

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                _async_run_review(
                    review_id=review_id,
                    pr_diff_url=pr_diff_url,
                    head_sha=head_sha,
                    repo_full_name=repo_full_name,
                )
            )
        finally:
            loop.run_until_complete(engine.dispose())
            loop.close()
    except Exception as exc:
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    _mark_failed(review_id, str(exc), head_sha=head_sha, repo_full_name=repo_full_name)
                )
            finally:
                loop.run_until_complete(engine.dispose())
                loop.close()
        except Exception as err:
            logger.error(f"Failed to mark review {review_id} as failed: {err}")
        raise self.retry(exc=exc)


async def _async_run_review(
    review_id: str,
    pr_diff_url: str,
    head_sha: str,
    repo_full_name: str,
) -> None:
    await _update_review_status(review_id, "running", started_at=datetime.utcnow())

    token = settings.github_token
    if token and head_sha and repo_full_name:
        await set_commit_status(
            token, repo_full_name, head_sha, "pending", "Argus review in progress…"
        )

    diff_headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3.diff",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(pr_diff_url, headers=diff_headers, follow_redirects=True)
        resp.raise_for_status()
        raw_diff = resp.text

    core_cfg = CoreConfig(
        llm_backend=settings.argus_llm_backend,  # type: ignore[arg-type]
        ollama_base_url=settings.argus_ollama_base_url,
        ollama_model=settings.argus_ollama_model,
        anthropic_api_key=settings.anthropic_api_key or None,
        anthropic_model=settings.argus_anthropic_model,
    )
    engine = ReviewEngine(core_cfg)
    result = await engine.review_diff(raw_diff)

    import uuid

    review_uuid = uuid.UUID(review_id)
    pr_number: int | None = None
    async with AsyncSessionLocal() as session:
        for f in result.findings:
            session.add(
                FindingModel(
                    review_id=review_uuid,
                    file_path=f.file_path,
                    line_start=f.line_start,
                    line_end=f.line_end,
                    severity=f.severity,
                    category=f.category,
                    confidence=f.confidence,
                    title=f.title,
                    description=f.description,
                    why_it_matters=f.why_it_matters,
                    suggested_fix=f.suggested_fix,
                    agent=f.agent,
                )
            )
        stmt = select(Review).where(Review.id == review_uuid)
        db_review = (await session.execute(stmt)).scalar_one()
        db_review.status = "completed"
        db_review.score = result.score
        db_review.total_findings = len(result.findings)
        db_review.completed_at = datetime.utcnow()
        pr_number = db_review.pr_number
        await session.commit()

    if not token:
        logger.info("GITHUB_TOKEN not set — skipping GitHub posting for review %s", review_id)
        await _update_review_status(review_id, "completed", github_comment_status="skipped")
        return

    if not (head_sha and repo_full_name and pr_number):
        logger.info("Missing PR metadata — skipping GitHub posting for review %s", review_id)
        await _update_review_status(review_id, "completed", github_comment_status="skipped")
        return

    review_ok = await post_pr_review(
        token=token,
        repo_full_name=repo_full_name,
        pr_number=pr_number,
        commit_id=head_sha,
        findings=result.findings,
        score=result.score,
    )
    logger.info("post_pr_review result: %s for review %s", review_ok, review_id)

    commit_state = "success" if result.score >= 70 else "failure"
    commit_desc = f"Score {result.score}/100 — {len(result.findings)} finding(s)"
    status_ok = await set_commit_status(
        token, repo_full_name, head_sha, commit_state, commit_desc
    )
    logger.info("set_commit_status result: %s for review %s", status_ok, review_id)

    gh_status = "success" if (review_ok and status_ok) else "failed"
    await _update_review_status(review_id, "completed", github_comment_status=gh_status)


async def _update_review_status(review_id: str, status: str, **kwargs: object) -> None:
    import uuid

    review_uuid = uuid.UUID(review_id)
    async with AsyncSessionLocal() as session:
        stmt = select(Review).where(Review.id == review_uuid)
        db_review = (await session.execute(stmt)).scalar_one_or_none()
        if db_review:
            db_review.status = status
            for k, v in kwargs.items():
                setattr(db_review, k, v)
            await session.commit()


async def _mark_failed(review_id: str, error: str, head_sha: str = "", repo_full_name: str = "") -> None:
    await _update_review_status(review_id, "failed", completed_at=datetime.utcnow())
    token = settings.github_token
    if token and head_sha and repo_full_name:
        await set_commit_status(
            token, repo_full_name, head_sha, "error", f"Argus review failed: {error[:100]}"
        )
```

- [ ] **Step 2: Run all tests to confirm no regressions**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/api/argus_api/tasks/review_task.py
git commit -m "feat: persist github_comment_status after review task completes"
```

---

## Task B4: Schema updates — `github_comment_status` + `repo_full_name`

**Files:**
- Modify: `packages/api/argus_api/schemas/review.py`
- Modify: `packages/api/argus_api/routers/reviews.py` (query join only)

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_routers.py`:

```python
@pytest.mark.asyncio
async def test_review_out_includes_github_status_and_repo_name():
    from argus_api.database import AsyncSessionLocal, Base, engine
    from argus_api.models.organization import Organization
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel
    import uuid

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        org = Organization(name="testorg", github_org_login="testorg")
        session.add(org)
        await session.flush()
        repo = Repository(
            org_id=org.id,
            github_repo_id="99999",
            full_name="testorg/testrepo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()
        review = ReviewModel(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=1,
            pr_title="Test PR",
            status="completed",
            github_comment_status="success",
        )
        session.add(review)
        await session.commit()
        review_id = str(review.id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{review_id}", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["github_comment_status"] == "success"
    assert data["repo_full_name"] == "testorg/testrepo"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest packages/api/tests/test_routers.py::test_review_out_includes_github_status_and_repo_name -v
```

Expected: FAIL — `github_comment_status` and `repo_full_name` not in schema yet

- [ ] **Step 3: Update `schemas/review.py`**

Replace the entire `packages/api/argus_api/schemas/review.py` with:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from argus_api.schemas.finding import FindingOut


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repo_id: uuid.UUID
    trigger_type: str
    pr_number: int | None
    pr_title: str | None
    base_sha: str | None
    head_sha: str | None
    status: str
    score: int | None
    total_findings: int
    started_at: datetime | None
    completed_at: datetime | None
    github_comment_status: str | None = None
    repo_full_name: str | None = None
    findings: list[FindingOut] = []


class ReviewListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int


class ReviewRetryOut(BaseModel):
    review_id: uuid.UUID
    status: str


class OverviewStats(BaseModel):
    total_reviews: int
    completed_reviews: int
    avg_score: float | None
    pass_rate: float | None
    open_findings: int
    total_findings: int

class ScorePoint(BaseModel):
    date: str
    score: float
    pr_title: str | None

class SeverityCount(BaseModel):
    severity: str
    count: int

class CategoryCount(BaseModel):
    category: str
    count: int
```

- [ ] **Step 4: Update the review queries in `routers/reviews.py` to join repository**

Replace the `list_reviews` and `get_review` functions in `packages/api/argus_api/routers/reviews.py` (keep `patch_finding` unchanged):

```python
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from argus_api.database import get_session
from argus_api.dependencies import require_api_key
from argus_api.limiter import limiter
from argus_api.models.finding import Finding
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import ReviewListOut, ReviewOut, ReviewRetryOut

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


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
    offset = (page - 1) * page_size
    query = select(Review).options(
        selectinload(Review.findings),
        selectinload(Review.repository),
    )
    count_query = select(func.count()).select_from(Review)

    if status:
        query = query.where(Review.status == status)
        count_query = count_query.where(Review.status == status)

    total = (await session.execute(count_query)).scalar_one()
    rows = (
        await session.execute(
            query.order_by(Review.started_at.desc()).offset(offset).limit(page_size)
        )
    ).scalars().all()

    return ReviewListOut(items=list(rows), total=total, page=page, page_size=page_size)


@router.get("/{review_id}", response_model=ReviewOut)
@limiter.limit("120/minute")
async def get_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> Review:
    row = (
        await session.execute(
            select(Review)
            .options(
                selectinload(Review.findings),
                selectinload(Review.repository),
            )
            .where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    return row


@router.patch("/{review_id}/findings/{finding_id}", response_model=FindingOut)
async def patch_finding(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingPatch,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> Finding:
    finding = (
        await session.execute(
            select(Finding).where(
                Finding.id == finding_id, Finding.review_id == review_id
            )
        )
    ).scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.is_resolved = body.is_resolved
    await session.commit()
    await session.refresh(finding)
    return finding
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest packages/api/tests/test_routers.py -v
```

Expected: all tests PASS including the new one

- [ ] **Step 6: Commit**

```bash
git add packages/api/argus_api/schemas/review.py packages/api/argus_api/routers/reviews.py packages/api/tests/test_routers.py
git commit -m "feat: add github_comment_status and repo_full_name to ReviewOut schema"
```

---

## Task B5: Retry endpoint

**Files:**
- Modify: `packages/api/argus_api/routers/reviews.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_routers.py`:

```python
@pytest.mark.asyncio
async def test_retry_review_creates_new_review():
    from argus_api.database import AsyncSessionLocal, Base, engine
    from argus_api.models.organization import Organization
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel
    from unittest.mock import patch

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        org = Organization(name="testorg2", github_org_login="testorg2")
        session.add(org)
        await session.flush()
        repo = Repository(
            org_id=org.id,
            github_repo_id="88888",
            full_name="testorg2/myrepo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()
        review = ReviewModel(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=42,
            pr_title="My PR",
            head_sha="abc123",
            status="completed",
        )
        session.add(review)
        await session.commit()
        review_id = str(review.id)

    with patch("argus_api.routers.reviews.run_review_task") as mock_task:
        mock_task.delay = lambda *a, **kw: type("T", (), {"id": "task-1"})()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(f"/api/v1/reviews/{review_id}/retry", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "queued"
    assert "review_id" in data
    assert data["review_id"] != review_id  # new record created


@pytest.mark.asyncio
async def test_retry_review_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(f"/api/v1/reviews/{uuid.uuid4()}/retry", headers=AUTH_HEADERS)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/api/tests/test_routers.py::test_retry_review_creates_new_review packages/api/tests/test_routers.py::test_retry_review_not_found -v
```

Expected: FAIL — endpoint does not exist yet

- [ ] **Step 3: Add retry endpoint to `routers/reviews.py`**

Add the following after the `get_review` function and before `patch_finding` in `packages/api/argus_api/routers/reviews.py`:

```python
@router.post("/{review_id}/retry", response_model=ReviewRetryOut)
@limiter.limit("10/minute")
async def retry_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> ReviewRetryOut:
    from argus_api.tasks.review_task import run_review_task

    original = (
        await session.execute(
            select(Review)
            .options(selectinload(Review.repository))
            .where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Review not found")

    repo_full_name = original.repository.full_name if original.repository else ""
    diff_url = f"https://api.github.com/repos/{repo_full_name}/pulls/{original.pr_number}"

    new_review = Review(
        repo_id=original.repo_id,
        trigger_type="retry",
        pr_number=original.pr_number,
        pr_title=original.pr_title,
        base_sha=original.base_sha,
        head_sha=original.head_sha,
        status="pending",
        started_at=datetime.utcnow(),
    )
    session.add(new_review)
    await session.commit()
    await session.refresh(new_review)

    run_review_task.delay(
        review_id=str(new_review.id),
        pr_diff_url=diff_url,
        head_sha=original.head_sha or "",
        repo_full_name=repo_full_name,
    )

    return ReviewRetryOut(review_id=new_review.id, status="queued")
```

Also add `from datetime import datetime` to the imports at the top of `routers/reviews.py`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/api/tests/test_routers.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/argus_api/routers/reviews.py packages/api/tests/test_routers.py
git commit -m "feat: add POST /api/v1/reviews/{id}/retry endpoint"
```

---

## Task F1: Skeleton, Toast, and useToast

**Files:**
- Create: `packages/dashboard/src/components/Skeleton.tsx`
- Create: `packages/dashboard/src/components/Toast.tsx`
- Create: `packages/dashboard/src/hooks/useToast.ts`

- [ ] **Step 1: Create `Skeleton.tsx`**

Create `packages/dashboard/src/components/Skeleton.tsx`:

```tsx
interface Props {
  className?: string;
}

export function Skeleton({ className = '' }: Props) {
  return (
    <div className={`animate-pulse bg-gray-700/50 rounded ${className}`} />
  );
}

export function SkeletonRow() {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-5 w-12" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonFinding() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}
```

- [ ] **Step 2: Create `useToast.ts`**

Create `packages/dashboard/src/hooks/useToast.ts`:

```ts
import { useContext } from 'react';
import { ToastContext } from '../components/Toast';

export function useToast() {
  return useContext(ToastContext);
}
```

- [ ] **Step 3: Create `Toast.tsx`**

Create `packages/dashboard/src/components/Toast.tsx`:

```tsx
import { createContext, useCallback, useState } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
});

interface Props { children: React.ReactNode }

export function ToastProvider({ children }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const value: ToastContextValue = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
              t.type === 'success'
                ? 'bg-green-900 border border-green-700 text-green-200'
                : 'bg-red-900 border border-red-700 text-red-200'
            }`}
          >
            <span>{t.type === 'success' ? '✓' : '✕'}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 4: Start dev server and verify no TypeScript errors**

```bash
cd packages/dashboard && npm run dev
```

Expected: compiles without errors. Open http://localhost:5173 to confirm the app still loads.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Skeleton.tsx packages/dashboard/src/components/Toast.tsx packages/dashboard/src/hooks/useToast.ts
git commit -m "feat(dashboard): add Skeleton, Toast, and useToast utilities"
```

---

## Task F2: GitHubStatusBadge and PageTransition

**Files:**
- Create: `packages/dashboard/src/components/GitHubStatusBadge.tsx`
- Create: `packages/dashboard/src/components/PageTransition.tsx`

- [ ] **Step 1: Create `GitHubStatusBadge.tsx`**

Create `packages/dashboard/src/components/GitHubStatusBadge.tsx`:

```tsx
type GHStatus = 'success' | 'failed' | 'skipped' | 'pending' | null | undefined;

interface Props {
  status: GHStatus;
  reviewStatus?: string;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: '✅ Commented',  className: 'bg-green-500/10 text-green-400' },
  failed:  { label: '❌ Failed',     className: 'bg-red-500/10 text-red-400' },
  skipped: { label: '⏭ Skipped',    className: 'bg-gray-500/10 text-gray-500' },
  pending: { label: '⏳ Pending',    className: 'bg-gray-500/10 text-gray-400' },
};

export function GitHubStatusBadge({ status, reviewStatus }: Props) {
  if (reviewStatus && !['completed', 'failed'].includes(reviewStatus)) return null;

  const key = status ?? 'pending';
  const cfg = CONFIG[key] ?? CONFIG.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 2: Create `PageTransition.tsx`**

Create `packages/dashboard/src/components/PageTransition.tsx`:

```tsx
import { useEffect, useState } from 'react';

interface Props { children: React.ReactNode }

export function PageTransition({ children }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={{ transition: 'opacity 150ms ease', opacity: visible ? 1 : 0 }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/GitHubStatusBadge.tsx packages/dashboard/src/components/PageTransition.tsx
git commit -m "feat(dashboard): add GitHubStatusBadge and PageTransition components"
```

---

## Task F3: Update types and API client

**Files:**
- Modify: `packages/dashboard/src/api/types.ts`
- Modify: `packages/dashboard/src/api/client.ts`

- [ ] **Step 1: Update `types.ts`**

Replace the `Review` interface in `packages/dashboard/src/api/types.ts` with:

```ts
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ReviewStatus = 'pending' | 'running' | 'completed' | 'failed';
export type GHStatus = 'success' | 'failed' | 'skipped' | 'pending' | null;

export interface Finding {
  id: string;
  review_id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  severity: Severity;
  category: string;
  confidence: number;
  title: string;
  description: string;
  why_it_matters: string;
  suggested_fix: string;
  agent: string;
  is_resolved: boolean;
}

export interface Review {
  id: string;
  repo_id: string;
  trigger_type: string;
  pr_number: number | null;
  pr_title: string | null;
  base_sha: string | null;
  head_sha: string | null;
  status: ReviewStatus;
  score: number | null;
  total_findings: number;
  started_at: string | null;
  completed_at: string | null;
  github_comment_status: GHStatus;
  repo_full_name: string | null;
  findings: Finding[];
}

export interface ReviewListOut {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewRetryOut {
  review_id: string;
  status: string;
}

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

- [ ] **Step 2: Add `retryReview` to `client.ts`**

Add the following to the `api` object in `packages/dashboard/src/api/client.ts`:

```ts
  retryReview: (id: string) =>
    apiFetch<ReviewRetryOut>(`/api/v1/reviews/${id}/retry`, { method: 'POST' }),
```

Also add `ReviewRetryOut` to the import at the top:

```ts
import type { Finding, Review, ReviewListOut, ReviewRetryOut } from './types';
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/api/types.ts packages/dashboard/src/api/client.ts
git commit -m "feat(dashboard): add GHStatus type, repo_full_name to Review, retryReview to client"
```

---

## Task F4: Update App.tsx with ToastProvider and PageTransition

**Files:**
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Update `App.tsx`**

Replace the entire `packages/dashboard/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearStoredApiKey, getStoredApiKey } from './api/client';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ToastProvider } from './components/Toast';
import { PageTransition } from './components/PageTransition';

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
      <ToastProvider>
        <BrowserRouter>
          <AppShell onLogout={handleLogout}>
            <Routes>
              <Route path="/"             element={<PageTransition><DashboardPage /></PageTransition>} />
              <Route path="/reviews"      element={<PageTransition><ReviewsPage /></PageTransition>} />
              <Route path="/repositories" element={<PageTransition><RepositoriesPage /></PageTransition>} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Verify app loads with no console errors**

Open http://localhost:5173, confirm the app loads, navigate between pages, confirm transitions feel smooth.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/App.tsx
git commit -m "feat(dashboard): wrap app with ToastProvider and add page transitions"
```

---

## Task F5: Update AppShell with sidebar count badges

**Files:**
- Modify: `packages/dashboard/src/layouts/AppShell.tsx`

- [ ] **Step 1: Update `AppShell.tsx`**

Replace the entire `packages/dashboard/src/layouts/AppShell.tsx` with:

```tsx
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';

interface Props { children: React.ReactNode; onLogout: () => void }

export function AppShell({ children, onLogout }: Props) {
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: analyticsApi.overview,
    refetchInterval: 30_000,
  });

  const NAV = [
    { to: '/',             icon: '📊', label: 'Dashboard',    count: null },
    { to: '/reviews',      icon: '🔍', label: 'Reviews',      count: overview?.total_reviews ?? null },
    { to: '/repositories', icon: '📁', label: 'Repos',        count: null },
  ];

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <div>
              <p className="text-sm font-bold text-white">Argus</p>
              <p className="text-xs text-gray-500">Code Review Engine</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon, label, count }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className="bg-gray-700 text-gray-300 text-xs rounded-full px-2 py-0.5">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
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
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Open the app and verify the "Reviews" sidebar item shows a count badge**

Open http://localhost:5173, confirm the Reviews item in the sidebar shows a number badge (e.g. `11`).

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/layouts/AppShell.tsx
git commit -m "feat(dashboard): add live count badges to sidebar nav items"
```

---

## Task F6: Update DashboardPage with skeleton loaders

**Files:**
- Modify: `packages/dashboard/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Update `DashboardPage.tsx`**

Replace the entire `packages/dashboard/src/pages/DashboardPage.tsx` with:

```tsx
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { SeverityDonutChart } from '../components/SeverityDonutChart';
import { StatCard } from '../components/StatCard';
import { TopCategoriesChart } from '../components/TopCategoriesChart';
import { SkeletonCard } from '../components/Skeleton';

export function DashboardPage() {
  const overview   = useQuery({ queryKey: ['analytics', 'overview'],   queryFn: analyticsApi.overview,              refetchInterval: 30_000 });
  const trend      = useQuery({ queryKey: ['analytics', 'trend'],      queryFn: () => analyticsApi.scoreTrend(30) });
  const severity   = useQuery({ queryKey: ['analytics', 'severity'],   queryFn: analyticsApi.severityBreakdown });
  const categories = useQuery({ queryKey: ['analytics', 'categories'], queryFn: analyticsApi.topCategories });

  const stats = overview.data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Overview of all code reviews and findings</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Reviews"
              value={stats?.total_reviews ?? '—'}
              sub={`${stats?.completed_reviews ?? 0} completed`}
              icon="📋"
              color="blue"
            />
            <StatCard
              label="Avg Score"
              value={stats?.avg_score != null ? `${stats.avg_score}` : '—'}
              sub="out of 100"
              icon="⭐"
              color={stats?.avg_score != null ? (stats.avg_score >= 80 ? 'green' : stats.avg_score >= 60 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.avg_score != null ? (stats.avg_score >= 70 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Pass Rate"
              value={stats?.pass_rate != null ? `${Math.round(stats.pass_rate * 100)}%` : '—'}
              sub="score ≥ 70"
              icon="✅"
              color={stats?.pass_rate != null ? (stats.pass_rate >= 0.8 ? 'green' : stats.pass_rate >= 0.5 ? 'yellow' : 'red') : 'blue'}
              trend={stats?.pass_rate != null ? (stats.pass_rate >= 0.7 ? 'up' : 'down') : undefined}
            />
            <StatCard
              label="Open Findings"
              value={stats?.open_findings ?? '—'}
              sub={`of ${stats?.total_findings ?? 0} total`}
              icon="⚠️"
              color={stats?.open_findings != null ? (stats.open_findings === 0 ? 'green' : stats.open_findings < 10 ? 'yellow' : 'red') : 'blue'}
            />
          </>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Score Trend</h2>
        {trend.isLoading
          ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
          : <ScoreTrendChart data={trend.data ?? []} />
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Open Findings by Severity</h2>
          {severity.isLoading
            ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
            : <SeverityDonutChart data={severity.data ?? []} />
          }
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Issue Categories</h2>
          {categories.isLoading
            ? <div className="h-48 animate-pulse bg-gray-800 rounded-lg" />
            : <TopCategoriesChart data={categories.data ?? []} />
          }
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:5173. On first load you should briefly see shimmer placeholders before the stat cards appear. (Hard to see with fast local API — try throttling network in DevTools to "Slow 3G" to confirm.)

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): replace loading spinners with skeleton loaders on DashboardPage"
```

---

## Task F7: Rewrite ReviewList with professional UI

**Files:**
- Modify: `packages/dashboard/src/components/ReviewList.tsx`

- [ ] **Step 1: Rewrite `ReviewList.tsx`**

Replace the entire `packages/dashboard/src/components/ReviewList.tsx` with:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonRow } from './Skeleton';
import type { Review } from '../api/types';

type SortKey = 'date' | 'score' | 'status';
type SortDir = 'asc' | 'desc';

interface Props { onSelect: (id: string) => void }

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-gray-600 ml-1">↕</span>;
  return <span className="text-blue-400 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export function ReviewList({ onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(),
    refetchInterval: 10_000,
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...(data?.items ?? [])].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') {
      cmp = (a.started_at ?? '').localeCompare(b.started_at ?? '');
    } else if (sortKey === 'score') {
      cmp = (a.score ?? -1) - (b.score ?? -1);
    } else if (sortKey === 'status') {
      cmp = a.status.localeCompare(b.status);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reviews</h1>
        <p className="text-sm text-gray-400 mt-0.5">All pull request reviews</p>
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-800 rounded-xl text-red-400 text-sm mb-4">Failed to load reviews.</div>}

      {!isLoading && data?.items.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-lg font-semibold text-white mb-2">No reviews yet</h2>
          <p className="text-sm text-gray-400 mb-4">Set up your GitHub webhook to start receiving automatic code reviews.</p>
          <a href="/docs/self-hosting.md" className="text-blue-400 text-sm hover:underline">View setup guide →</a>
        </div>
      )}

      {(isLoading || (data?.items.length ?? 0) > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] border-b border-gray-800 px-4 py-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pull Request</span>
            <button
              onClick={() => handleSort('status')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
            </button>
            <button
              onClick={() => handleSort('score')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Score <SortIcon active={sortKey === 'score'} dir={sortDir} />
            </button>
            <button
              onClick={() => handleSort('date')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors px-3"
            >
              Date <SortIcon active={sortKey === 'date'} dir={sortDir} />
            </button>
          </div>

          <div className="divide-y divide-gray-800">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : sorted.map((review: Review) => (
                  <div
                    key={review.id}
                    onClick={() => onSelect(review.id)}
                    className="px-4 py-3 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">
                            {review.pr_title ?? `PR #${review.pr_number}`}
                          </p>
                          {review.repo_full_name && review.pr_number && (
                            <a
                              href={`https://github.com/${review.repo_full_name}/pull/${review.pr_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline shrink-0"
                            >
                              View PR →
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {review.started_at ? new Date(review.started_at).toLocaleString() : '—'}
                          {' '}· {review.total_findings} finding(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <GitHubStatusBadge status={review.github_comment_status} reviewStatus={review.status} />
                        <StatusBadge status={review.status} />
                        <ScoreBadge score={review.score} />
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {data && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {data.total} total · auto-refreshes every 10s
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:5173/reviews. Verify:
- Table shows skeleton rows while loading
- Column headers "Status", "Score", "Date" are clickable and sort the list
- Each row has a "View PR →" link (if `repo_full_name` is present)
- GitHub status badge appears next to `StatusBadge` for completed reviews
- Clicking anywhere on a row navigates to review detail

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/ReviewList.tsx
git commit -m "feat(dashboard): rewrite ReviewList with sortable columns, skeleton, PR links, GitHub badge"
```

---

## Task F8: Rewrite ReviewDetail with two-panel layout and re-review button

**Files:**
- Modify: `packages/dashboard/src/components/ReviewDetail.tsx`

- [ ] **Step 1: Rewrite `ReviewDetail.tsx`**

Replace the entire `packages/dashboard/src/components/ReviewDetail.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonFinding } from './Skeleton';
import { useToast } from '../hooks/useToast';
import type { Finding } from '../api/types';

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  useEffect(() => {
    if (data && data.findings.length > 0 && !selectedFinding) {
      setSelectedFinding(data.findings[0]);
    }
  }, [data]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await api.retryReview(reviewId);
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Re-review queued');
      onBack();
    } catch {
      toast.error('Failed to queue re-review');
    } finally {
      setRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-sm text-blue-400 hover:underline mb-4 block">← Back to reviews</button>
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonFinding key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-red-400">Failed to load review.</div>;
  }

  const canRetry = data.status === 'completed' || data.status === 'failed';
  const displayFinding = selectedFinding ?? data.findings[0] ?? null;

  return (
    <div className="p-6 h-full flex flex-col">
      <button onClick={onBack} className="text-sm text-blue-400 hover:underline mb-4 block">
        ← Back to reviews
      </button>

      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="text-xl font-bold text-white truncate">
            {data.pr_title ?? `PR #${data.pr_number}`}
          </h1>
          <StatusBadge status={data.status} />
          <ScoreBadge score={data.score} />
          <GitHubStatusBadge status={data.github_comment_status} reviewStatus={data.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.repo_full_name && data.pr_number && (
            <a
              href={`https://github.com/${data.repo_full_name}/pull/${data.pr_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              View PR →
            </a>
          )}
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            >
              {retrying ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
                  Queuing…
                </>
              ) : (
                '↺ Re-review'
              )}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        {data.total_findings} finding(s) · {data.completed_at ? new Date(data.completed_at).toLocaleString() : 'In progress'}
      </p>

      {data.findings.length === 0 && (
        <p className="text-green-400 font-medium">No findings — clean review! 🎉</p>
      )}

      {data.findings.length > 0 && (
        <div className="flex gap-4 flex-1 min-h-0 lg:flex-row flex-col">
          {/* Left panel: findings list */}
          <div className="lg:w-2/5 overflow-y-auto space-y-1 pr-1">
            {data.findings.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFinding(f)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  displayFinding?.id === f.id
                    ? 'bg-blue-600/20 border border-blue-600/40'
                    : 'hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{SEVERITY_ICON[f.severity] ?? '⚪'}</span>
                  <span className={`text-xs font-medium truncate ${f.is_resolved ? 'line-through text-gray-500' : 'text-white'}`}>
                    {f.title}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate pl-6">{f.file_path}:{f.line_start}</p>
              </button>
            ))}
          </div>

          {/* Right panel: finding detail */}
          <div className="lg:w-3/5 overflow-y-auto">
            {displayFinding ? (
              <FindingDetail finding={displayFinding} reviewId={reviewId} />
            ) : (
              <div className="text-gray-500 text-sm p-4">Select a finding to see details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FindingDetail({ finding, reviewId }: { finding: Finding; reviewId: string }) {
  const queryClient = useQueryClient();

  async function resolve() {
    await api.resolveFinding(reviewId, finding.id);
    await queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
  }

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/10 border-red-800 text-red-400',
    high: 'bg-orange-500/10 border-orange-800 text-orange-400',
    medium: 'bg-yellow-500/10 border-yellow-800 text-yellow-400',
    low: 'bg-blue-500/10 border-blue-800 text-blue-400',
    info: 'bg-gray-500/10 border-gray-700 text-gray-400',
  };

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${severityColors[finding.severity] ?? severityColors.info}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span>{SEVERITY_ICON[finding.severity] ?? '⚪'}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{finding.severity}</span>
            <span className="text-xs text-gray-500">·</span>
            <span className="text-xs text-gray-500">{finding.category}</span>
          </div>
          <h3 className="text-sm font-semibold text-white">{finding.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{finding.file_path}:{finding.line_start}–{finding.line_end}</p>
        </div>
        {!finding.is_resolved && (
          <button
            onClick={resolve}
            className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            Resolve
          </button>
        )}
        {finding.is_resolved && (
          <span className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400">✓ Resolved</span>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm text-gray-300">{finding.description}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Why it matters</p>
        <p className="text-sm text-gray-300">{finding.why_it_matters}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Suggested fix</p>
        <pre className="text-xs bg-gray-950 rounded-lg p-3 text-gray-300 whitespace-pre-wrap overflow-x-auto">{finding.suggested_fix}</pre>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-700/50">
        <span>Agent: {finding.agent}</span>
        <span>·</span>
        <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Verify in browser**

Open a review detail. Verify:
- Left panel shows compact finding list with severity icons; clicking a finding highlights it
- Right panel shows full finding detail with description, why it matters, suggested fix, resolve button
- "Re-review" button appears for completed/failed reviews
- "View PR →" link appears if `repo_full_name` is set
- GitHub status badge shows next to the StatusBadge in the header
- On mobile (resize to < 1024px), panels stack vertically

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/ReviewDetail.tsx
git commit -m "feat(dashboard): two-panel ReviewDetail with re-review button, PR link, GitHub badge"
```

---

## Task F9: Update RepositoriesPage with improved empty state

**Files:**
- Modify: `packages/dashboard/src/pages/RepositoriesPage.tsx`

- [ ] **Step 1: Update `RepositoriesPage.tsx`**

Replace the empty state and loading section in `packages/dashboard/src/pages/RepositoriesPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { SkeletonRow } from '../components/Skeleton';

const BASE = import.meta.env.VITE_API_URL ?? '';

interface Repo {
  id: string;
  full_name: string;
  default_branch: string;
  is_active: boolean;
  created_at: string;
}

async function fetchRepos(): Promise<Repo[]> {
  const key = localStorage.getItem('argus_api_key') ?? '';
  const res = await fetch(`${BASE}/api/v1/repositories`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export function RepositoriesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['repositories'], queryFn: fetchRepos });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-sm text-gray-400 mt-0.5">All monitored repositories</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-800 rounded-xl text-red-400 text-sm mb-4">
          Failed to load repositories.
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📁</div>
          <h2 className="text-lg font-semibold text-white mb-2">No repositories yet</h2>
          <p className="text-sm text-gray-400 mb-4">Repositories are registered automatically when GitHub sends a webhook event.</p>
          <a href="/docs/self-hosting.md" className="text-blue-400 text-sm hover:underline">View webhook setup guide →</a>
        </div>
      )}

      {(isLoading || (data?.length ?? 0) > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Repository</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Default Branch</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4} className="px-4 py-3">
                        <SkeletonRow />
                      </td>
                    </tr>
                  ))
                : data!.map(repo => (
                    <tr key={repo.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{repo.full_name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{repo.default_branch}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${repo.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {repo.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(repo.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:5173/repositories. If you have repos, they should still show. Navigate away and back — the table skeleton should briefly flash.

- [ ] **Step 3: Run TypeScript check and confirm all tests pass**

```bash
cd packages/dashboard && npx tsc --noEmit
cd /Users/kdn_aisashwat/Documents/argus-review && uv run pytest packages/api/tests/ -v
```

Expected: no TS errors, all Python tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/pages/RepositoriesPage.tsx
git commit -m "feat(dashboard): improved empty state and skeleton loaders for RepositoriesPage"
```

---

## End-to-End Webhook Test Checklist

After all tasks are complete, verify the full flow:

- [ ] **Start ngrok:** `ngrok http 8000` — copy the forwarding URL

- [ ] **Configure GitHub webhook** on a test repo:
  - Payload URL: `https://<ngrok-url>/webhooks/github`
  - Content type: `application/json`
  - Secret: value of `GITHUB_WEBHOOK_SECRET` from `.env`
  - Events: Pull requests only

- [ ] **Start all local services:**
  ```bash
  # Terminal 1 — API
  uv run uvicorn argus_api.main:app --host 0.0.0.0 --port 8000

  # Terminal 2 — Celery worker
  uv run celery -A argus_api.tasks.celery_app worker --loglevel=info

  # Terminal 3 — Dashboard
  cd packages/dashboard && npm run dev
  ```

- [ ] **Open a PR** on your test repo

- [ ] **Verify in Celery logs:** `run_review_task` executes without error

- [ ] **Verify on GitHub PR:** inline comment and summary comment appear

- [ ] **Verify commit status** on the PR shows ✅ or ❌

- [ ] **Verify in dashboard** at http://localhost:5173/reviews:
  - New review appears at top
  - `github_comment_status` badge shows `✅ Commented`
  - "View PR →" link navigates to the correct GitHub PR

- [ ] **Click Re-review** on a completed review — toast shows "Re-review queued", new review appears in the list
