from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from argus_api.database import get_session
from argus_api.models.repository import Repository
from argus_api.schemas.repository import RepositoryOut

router = APIRouter(prefix="/api/v1/repositories", tags=["repositories"])


@router.get("", response_model=list[RepositoryOut])
async def list_repositories(
    session: AsyncSession = Depends(get_session),
) -> list[Repository]:
    rows = (
        await session.execute(select(Repository).where(Repository.is_active.is_(True)))
    ).scalars().all()
    return list(rows)


@router.get("/{repo_id}", response_model=RepositoryOut)
async def get_repository(
    repo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Repository:
    row = (
        await session.execute(select(Repository).where(Repository.id == repo_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
    return row
