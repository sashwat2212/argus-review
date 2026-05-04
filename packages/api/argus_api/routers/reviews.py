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

try:
    from argus_api.tasks.review_task import run_review_task
except Exception:  # pragma: no cover
    run_review_task = None  # type: ignore[assignment]

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


@router.post("/{review_id}/retry", response_model=ReviewRetryOut)
@limiter.limit("10/minute")
async def retry_review(
    request: Request,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_api_key),
) -> ReviewRetryOut:
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
