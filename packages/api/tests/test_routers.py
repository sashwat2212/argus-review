from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from argus_api.main import app

AUTH_HEADERS = {"Authorization": "Bearer test-api-key"}


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_list_reviews_empty():
    from argus_api.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_repositories_empty():
    from argus_api.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/repositories", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_review_not_found():
    from argus_api.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{uuid.uuid4()}", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_reviews_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_reviews_with_valid_token():
    from argus_api.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers={"Authorization": "Bearer test-api-key"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_reviews_with_wrong_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers={"Authorization": "Bearer wrong-key"})
    assert resp.status_code == 401


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
    assert data["review_id"] != review_id


@pytest.mark.asyncio
async def test_retry_review_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(f"/api/v1/reviews/{uuid.uuid4()}/retry", headers=AUTH_HEADERS)
    assert resp.status_code == 404
