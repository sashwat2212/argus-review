from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from argus_api.database import get_session
from argus_api.dependencies import get_current_user
from argus_api.limiter import limiter
from argus_api.models.finding import Finding
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.models.user import User
from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import (
    AgentBreakdownItem,
    ReviewListOut,
    ReviewOut,
    ReviewRetryOut,
    ReviewStatsOut,
    SeverityCount,
)

try:
    from argus_api.tasks.review_task import run_review_task
except Exception:  # pragma: no cover
    run_review_task = None  # type: ignore[assignment]

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


def _org_scoped_review_query(org_id: uuid.UUID):
    """Base query that filters reviews to the caller's organization."""
    return (
        select(Review)
        .join(Repository, Review.repo_id == Repository.id)
        .where(Repository.org_id == org_id)
    )


@router.get("", response_model=ReviewListOut)
@limiter.limit("60/minute")
async def list_reviews(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReviewListOut:
    offset = (page - 1) * page_size

    query = _org_scoped_review_query(current_user.org_id).options(
        selectinload(Review.findings),
        selectinload(Review.repository),
    )
    count_query = (
        select(func.count())
        .select_from(Review)
        .join(Repository, Review.repo_id == Repository.id)
        .where(Repository.org_id == current_user.org_id)
    )

    if status:
        query = query.where(Review.status == status)
        count_query = count_query.where(Review.status == status)

    total = (await session.execute(count_query)).scalar_one()
    rows = (
        (
            await session.execute(
                query.order_by(Review.started_at.desc()).offset(offset).limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return ReviewListOut(items=list(rows), total=total, page=page, page_size=page_size)


@router.get("/{review_id}", response_model=ReviewOut)
@limiter.limit("120/minute")
async def get_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Review:
    row = (
        await session.execute(
            _org_scoped_review_query(current_user.org_id)
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


@router.post("/{review_id}/retry", response_model=ReviewRetryOut)
@limiter.limit("10/minute")
async def retry_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReviewRetryOut:
    original = (
        await session.execute(
            _org_scoped_review_query(current_user.org_id)
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
        started_at=datetime.now(UTC),
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


@router.patch("/{review_id}/findings/{finding_id}", response_model=FindingOut)
async def patch_finding(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingPatch,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Finding:
    # Verify the review belongs to the user's org before mutating
    review = (
        await session.execute(
            _org_scoped_review_query(current_user.org_id).where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    finding = (
        await session.execute(
            select(Finding).where(Finding.id == finding_id, Finding.review_id == review_id)
        )
    ).scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.is_resolved = body.is_resolved
    await session.commit()
    await session.refresh(finding)
    return finding


@router.get("/{review_id}/stats", response_model=ReviewStatsOut)
@limiter.limit("60/minute")
async def get_review_stats(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReviewStatsOut:
    review = (
        await session.execute(
            _org_scoped_review_query(current_user.org_id).where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    sev_rows = (
        await session.execute(
            select(Finding.severity, func.count().label("cnt"))
            .where(Finding.review_id == review_id)
            .group_by(Finding.severity)
            .order_by(func.count().desc())
        )
    ).all()

    agent_rows = (
        await session.execute(
            select(
                Finding.agent,
                func.count().label("total"),
                func.sum(case((Finding.is_resolved.is_(True), 1), else_=0)).label("resolved"),
            )
            .where(Finding.review_id == review_id)
            .group_by(Finding.agent)
        )
    ).all()

    total = (
        await session.execute(
            select(func.count()).select_from(Finding).where(Finding.review_id == review_id)
        )
    ).scalar_one()
    resolved = (
        await session.execute(
            select(func.count())
            .select_from(Finding)
            .where(Finding.review_id == review_id, Finding.is_resolved.is_(True))
        )
    ).scalar_one()

    return ReviewStatsOut(
        severity_breakdown=[SeverityCount(severity=r.severity, count=r.cnt) for r in sev_rows],
        agent_breakdown=[
            AgentBreakdownItem(
                agent=r.agent,
                total=r.total,
                resolved=int(r.resolved or 0),
                resolution_rate=round(int(r.resolved or 0) / r.total, 3) if r.total else 0.0,
            )
            for r in agent_rows
        ],
        total_findings=total,
        resolved_findings=resolved,
    )


@router.post("/{review_id}/findings/resolve-all")
@limiter.limit("20/minute")
async def resolve_all_findings(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    # Verify org ownership before bulk-mutating
    review = (
        await session.execute(
            _org_scoped_review_query(current_user.org_id).where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    await session.execute(
        update(Finding)
        .where(Finding.review_id == review_id, Finding.is_resolved.is_(False))
        .values(is_resolved=True)
    )
    await session.commit()
    return {"status": "ok", "review_id": str(review_id)}
