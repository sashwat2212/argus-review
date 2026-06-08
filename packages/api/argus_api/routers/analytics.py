from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import case, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from argus_api.database import get_session
from argus_api.dependencies import get_current_user
from argus_api.limiter import limiter
from argus_api.models.finding import Finding
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.models.user import User
from argus_api.schemas.review import (
    AgentBreakdownItem,
    CategoryCount,
    OverviewStats,
    RepositoryHealthItem,
    ReviewDurationStats,
    ScoreDistributionItem,
    ScorePoint,
    SeverityCount,
    TopFileItem,
    VelocityPoint,
)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


def _org_review_ids_subquery(org_id: uuid.UUID):
    """Subquery that returns review IDs belonging to the org."""
    return (
        select(Review.id)
        .join(Repository, Review.repo_id == Repository.id)
        .where(Repository.org_id == org_id)
        .scalar_subquery()
    )


@router.get("/overview", response_model=OverviewStats)
@limiter.limit("60/minute")
async def get_overview(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> OverviewStats:
    org_id = current_user.org_id

    base = (
        select(func.count())
        .select_from(Review)
        .join(Repository, Review.repo_id == Repository.id)
        .where(Repository.org_id == org_id)
    )

    total = (await session.execute(base)).scalar_one()
    completed = (
        await session.execute(base.where(Review.status == "completed"))
    ).scalar_one()
    avg_score_row = (await session.execute(
        select(func.avg(Review.score))
        .join(Repository, Review.repo_id == Repository.id)
        .where(Repository.org_id == org_id, Review.status == "completed")
    )).scalar_one()
    pass_count = (await session.execute(
        select(func.count())
        .select_from(Review)
        .join(Repository, Review.repo_id == Repository.id)
        .where(
            Repository.org_id == org_id,
            Review.status == "completed",
            Review.score >= 70,
        )
    )).scalar_one()

    org_review_ids = _org_review_ids_subquery(org_id)
    open_findings = (await session.execute(
        select(func.count())
        .select_from(Finding)
        .where(Finding.review_id.in_(org_review_ids), Finding.is_resolved.is_(False))
    )).scalar_one()
    total_findings = (await session.execute(
        select(func.count())
        .select_from(Finding)
        .where(Finding.review_id.in_(org_review_ids))
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
    current_user: User = Depends(get_current_user),
) -> list[ScorePoint]:
    rows = (await session.execute(
        select(Review.completed_at, Review.score, Review.pr_title)
        .join(Repository, Review.repo_id == Repository.id)
        .where(
            Repository.org_id == current_user.org_id,
            Review.status == "completed",
            Review.score.is_not(None),
        )
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
    current_user: User = Depends(get_current_user),
) -> list[SeverityCount]:
    org_review_ids = _org_review_ids_subquery(current_user.org_id)
    rows = (await session.execute(
        select(Finding.severity, func.count().label("cnt"))
        .where(
            Finding.review_id.in_(org_review_ids),
            Finding.is_resolved.is_(False),
        )
        .group_by(Finding.severity)
        .order_by(func.count().desc())
    )).all()
    return [SeverityCount(severity=r.severity, count=r.cnt) for r in rows]


@router.get("/top-categories", response_model=list[CategoryCount])
@limiter.limit("60/minute")
async def get_top_categories(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CategoryCount]:
    org_review_ids = _org_review_ids_subquery(current_user.org_id)
    rows = (await session.execute(
        select(Finding.category, func.count().label("cnt"))
        .where(Finding.review_id.in_(org_review_ids))
        .group_by(Finding.category)
        .order_by(func.count().desc())
        .limit(10)
    )).all()
    return [CategoryCount(category=r.category, count=r.cnt) for r in rows]


@router.get("/repository-health", response_model=list[RepositoryHealthItem])
@limiter.limit("30/minute")
async def get_repository_health(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[RepositoryHealthItem]:
    repos = (
        await session.execute(
            select(Repository).where(Repository.org_id == current_user.org_id)
        )
    ).scalars().all()

    result = []
    for repo in repos:
        total = (await session.execute(
            select(func.count()).select_from(Review).where(Review.repo_id == repo.id)
        )).scalar_one()
        avg_row = (await session.execute(
            select(func.avg(Review.score)).where(
                Review.repo_id == repo.id, Review.status == "completed"
            )
        )).scalar_one()
        open_f = (await session.execute(
            select(func.count()).select_from(Finding)
            .join(Review, Finding.review_id == Review.id)
            .where(Review.repo_id == repo.id, Finding.is_resolved.is_(False))
        )).scalar_one()
        last_row = (await session.execute(
            select(Review.completed_at)
            .where(Review.repo_id == repo.id, Review.status == "completed")
            .order_by(Review.completed_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        result.append(RepositoryHealthItem(
            repo_id=repo.id,
            full_name=repo.full_name,
            total_reviews=total,
            avg_score=round(float(avg_row), 1) if avg_row is not None else None,
            open_findings=open_f,
            last_review_at=last_row,
        ))
    return result


@router.get("/agent-breakdown", response_model=list[AgentBreakdownItem])
@limiter.limit("60/minute")
async def get_agent_breakdown(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AgentBreakdownItem]:
    org_review_ids = _org_review_ids_subquery(current_user.org_id)
    rows = (await session.execute(
        select(
            Finding.agent,
            func.count().label("total"),
            func.sum(case((Finding.is_resolved.is_(True), 1), else_=0)).label("resolved"),
        )
        .where(Finding.review_id.in_(org_review_ids))
        .group_by(Finding.agent)
        .order_by(func.count().desc())
    )).all()
    return [
        AgentBreakdownItem(
            agent=r.agent,
            total=r.total,
            resolved=int(r.resolved or 0),
            resolution_rate=round(int(r.resolved or 0) / r.total, 3) if r.total else 0.0,
        )
        for r in rows
    ]


@router.get("/finding-velocity", response_model=list[VelocityPoint])
@limiter.limit("60/minute")
async def get_finding_velocity(
    request: Request,
    days: int = 14,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[VelocityPoint]:
    today = datetime.now(UTC).date()
    date_list = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]

    opened_rows = (await session.execute(
        select(
            func.date(Review.started_at).label("d"),
            func.count(Finding.id).label("cnt"),
        )
        .join(Repository, Review.repo_id == Repository.id)
        .join(Finding, Finding.review_id == Review.id)
        .where(
            Repository.org_id == current_user.org_id,
            Review.started_at >= datetime.now(UTC) - timedelta(days=days),
        )
        .group_by(func.date(Review.started_at))
    )).all()
    opened_map = {str(r.d): r.cnt for r in opened_rows}

    resolved_rows = (await session.execute(
        select(
            func.date(Review.completed_at).label("d"),
            func.count(Finding.id).label("cnt"),
        )
        .join(Repository, Review.repo_id == Repository.id)
        .join(Finding, Finding.review_id == Review.id)
        .where(
            Repository.org_id == current_user.org_id,
            Finding.is_resolved.is_(True),
            Review.completed_at >= datetime.now(UTC) - timedelta(days=days),
        )
        .group_by(func.date(Review.completed_at))
    )).all()
    resolved_map = {str(r.d): r.cnt for r in resolved_rows}

    return [
        VelocityPoint(
            date=str(d),
            opened=opened_map.get(str(d), 0),
            resolved=resolved_map.get(str(d), 0),
        )
        for d in date_list
    ]


@router.get("/score-distribution", response_model=list[ScoreDistributionItem])
@limiter.limit("60/minute")
async def get_score_distribution(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ScoreDistributionItem]:
    bands = [
        ("0–20", 0, 20), ("21–40", 21, 40), ("41–60", 41, 60),
        ("61–80", 61, 80), ("81–100", 81, 100),
    ]
    result = []
    for label, lo, hi in bands:
        cnt = (await session.execute(
            select(func.count())
            .select_from(Review)
            .join(Repository, Review.repo_id == Repository.id)
            .where(
                Repository.org_id == current_user.org_id,
                Review.status == "completed",
                Review.score >= lo,
                Review.score <= hi,
            )
        )).scalar_one()
        result.append(ScoreDistributionItem(band=label, count=cnt))
    return result


@router.get("/top-files", response_model=list[TopFileItem])
@limiter.limit("60/minute")
async def get_top_files(
    request: Request,
    limit: int = 10,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TopFileItem]:
    org_review_ids = _org_review_ids_subquery(current_user.org_id)
    rows = (await session.execute(
        select(Finding.file_path, func.count().label("cnt"))
        .where(Finding.review_id.in_(org_review_ids))
        .group_by(Finding.file_path)
        .order_by(func.count().desc())
        .limit(limit)
    )).all()
    return [TopFileItem(file_path=r.file_path, count=r.cnt) for r in rows]


@router.get("/review-duration", response_model=ReviewDurationStats)
@limiter.limit("60/minute")
async def get_review_duration(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReviewDurationStats:
    row = (await session.execute(
        select(
            func.avg(
                extract("epoch", Review.completed_at) - extract("epoch", Review.started_at)
            ).label("avg_s"),
            func.min(
                extract("epoch", Review.completed_at) - extract("epoch", Review.started_at)
            ).label("min_s"),
            func.max(
                extract("epoch", Review.completed_at) - extract("epoch", Review.started_at)
            ).label("max_s"),
        )
        .join(Repository, Review.repo_id == Repository.id)
        .where(
            Repository.org_id == current_user.org_id,
            Review.status == "completed",
            Review.completed_at.is_not(None),
            Review.started_at.is_not(None),
        )
    )).one()
    return ReviewDurationStats(
        avg_seconds=round(float(row.avg_s), 1) if row.avg_s is not None else None,
        min_seconds=round(float(row.min_s), 1) if row.min_s is not None else None,
        max_seconds=round(float(row.max_s), 1) if row.max_s is not None else None,
    )
