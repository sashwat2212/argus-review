from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from argus_api.models import Finding, Organization, Repository, Review
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    from argus_api.database import Base
    eng = create_async_engine(DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with SessionLocal() as s:
        yield s
        await s.rollback()


@pytest.mark.asyncio
async def test_create_org_and_repo(session: AsyncSession):
    org = Organization(name="acme", github_org_login="acme")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="12345",
        full_name="acme/backend",
    )
    session.add(repo)
    await session.flush()

    assert repo.id is not None
    assert repo.org_id == org.id


@pytest.mark.asyncio
async def test_create_review_and_finding(session: AsyncSession):
    org = Organization(name="test-org", github_org_login="test-org")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="99999",
        full_name="test-org/repo",
    )
    session.add(repo)
    await session.flush()

    review = Review(
        repo_id=repo.id,
        pr_number=1,
        pr_title="Test PR",
        status="pending",
    )
    session.add(review)
    await session.flush()

    finding = Finding(
        review_id=review.id,
        file_path="main.py",
        line_start=10,
        line_end=12,
        severity="high",
        category="sql_injection",
        confidence=0.9,
        title="SQL Injection",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix",
        agent="security",
    )
    session.add(finding)
    await session.commit()

    assert finding.id is not None
    assert finding.is_resolved is False


@pytest.mark.asyncio
async def test_review_stores_raw_diff(session: AsyncSession):
    org = Organization(name="diff-org", github_org_login="diff-org")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="77777",
        full_name="diff-org/repo",
    )
    session.add(repo)
    await session.flush()

    raw = "diff --git a/foo.py b/foo.py\n--- a/foo.py\n+++ b/foo.py\n+new line\n"
    review = Review(
        repo_id=repo.id,
        pr_number=5,
        status="completed",
        raw_diff=raw,
    )
    session.add(review)
    await session.commit()

    assert review.raw_diff == raw
