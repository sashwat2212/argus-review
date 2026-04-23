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

    if token and head_sha and repo_full_name and pr_number:
        await post_pr_review(
            token=token,
            repo_full_name=repo_full_name,
            pr_number=pr_number,
            commit_id=head_sha,
            findings=result.findings,
            score=result.score,
        )
        commit_state = "success" if result.score >= 70 else "failure"
        commit_desc = (
            f"Score {result.score}/100 — {len(result.findings)} finding(s)"
        )
        await set_commit_status(token, repo_full_name, head_sha, commit_state, commit_desc)


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
