from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from argus_api.config import settings
from argus_api.database import AsyncSessionLocal
from argus_api.models.organization import Organization
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.tasks.review_task import run_review_task

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


@router.post("/github", status_code=202)
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(None),
    x_github_event: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
) -> dict:
    body = await request.body()

    if settings.github_webhook_secret:
        _verify_signature(body, x_hub_signature_256 or "")

    if x_github_delivery:
        r = _get_redis()
        key = f"webhook:delivery:{x_github_delivery}"
        if await r.exists(key):
            return {"status": "duplicate", "delivery": x_github_delivery}
        await r.setex(key, int(timedelta(hours=24).total_seconds()), "1")

    if x_github_event != "pull_request":
        return {"status": "ignored", "event": x_github_event}

    payload = json.loads(body)
    action = payload.get("action")
    if action not in ("opened", "synchronize", "reopened"):
        return {"status": "ignored", "action": action}

    pr = payload["pull_request"]
    repo_data = payload["repository"]

    async with AsyncSessionLocal() as session:
        org_login = repo_data.get("owner", {}).get("login", "unknown")
        org = (
            await session.execute(
                select(Organization).where(Organization.github_org_login == org_login)
            )
        ).scalar_one_or_none()
        if not org:
            org = Organization(name=org_login, github_org_login=org_login)
            session.add(org)
            await session.flush()

        gh_repo_id = str(repo_data["id"])
        repo = (
            await session.execute(
                select(Repository).where(Repository.github_repo_id == gh_repo_id)
            )
        ).scalar_one_or_none()
        if not repo:
            repo = Repository(
                org_id=org.id,
                github_repo_id=gh_repo_id,
                full_name=repo_data["full_name"],
                default_branch=repo_data.get("default_branch", "main"),
            )
            session.add(repo)
            await session.flush()

        review = Review(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=pr["number"],
            pr_title=pr.get("title", ""),
            base_sha=pr.get("base", {}).get("sha"),
            head_sha=pr.get("head", {}).get("sha"),
            status="pending",
            started_at=datetime.utcnow(),
        )
        session.add(review)
        await session.commit()

    task = run_review_task.delay(
        review_id=str(review.id),
        pr_diff_url=pr.get("url", ""),
        head_sha=pr.get("head", {}).get("sha", ""),
        repo_full_name=repo_data["full_name"],
    )

    return {"status": "queued", "review_id": str(review.id), "task_id": task.id}


def _verify_signature(body: bytes, signature: str) -> None:
    secret = settings.github_webhook_secret.encode()
    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
