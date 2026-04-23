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
