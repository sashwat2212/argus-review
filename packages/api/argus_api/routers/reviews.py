from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from argus_api.database import get_session
from argus_api.limiter import limiter
from argus_api.models.finding import Finding
from argus_api.models.review import Review
from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import ReviewListOut, ReviewOut

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


@router.get("", response_model=ReviewListOut)
@limiter.limit("60/minute")
async def list_reviews(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> ReviewListOut:
    offset = (page - 1) * page_size
    query = select(Review).options(selectinload(Review.findings))
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
) -> Review:
    row = (
        await session.execute(
            select(Review)
            .options(selectinload(Review.findings))
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
