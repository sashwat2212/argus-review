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
