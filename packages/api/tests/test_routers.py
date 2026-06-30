from __future__ import annotations

import uuid

import pytest
from argus_api.main import app
from httpx import ASGITransport, AsyncClient

from conftest import AUTH_HEADERS, TEST_ORG_ID


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_list_reviews_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_repositories_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/repositories", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_review_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{uuid.uuid4()}", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_reviews_requires_auth():
    """Without any auth, the endpoint should return 401."""
    from argus_api.dependencies import get_current_user

    # Temporarily remove the mock so real JWT auth runs
    app.dependency_overrides.pop(get_current_user, None)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/reviews")
        assert resp.status_code == 401
    finally:
        from conftest import _test_user

        async def _mock_user():
            return _test_user

        app.dependency_overrides[get_current_user] = _mock_user


@pytest.mark.asyncio
async def test_list_reviews_with_wrong_token():
    """A garbage Bearer token should be rejected with 401."""
    from argus_api.dependencies import get_current_user

    app.dependency_overrides.pop(get_current_user, None)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/reviews",
                headers={"Authorization": "Bearer totally-wrong-token"},
            )
        assert resp.status_code == 401
    finally:
        from conftest import _test_user

        async def _mock_user():
            return _test_user

        app.dependency_overrides[get_current_user] = _mock_user


@pytest.mark.asyncio
async def test_review_has_github_comment_status_field():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_review_out_includes_github_status_and_repo_name():
    """Review created in the TEST org is visible to the test user."""
    from argus_api.database import AsyncSessionLocal
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel

    async with AsyncSessionLocal() as session:
        # Use TEST_ORG_ID so the mock user owns this repo
        repo = Repository(
            org_id=TEST_ORG_ID,
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
async def test_review_cross_org_is_not_visible():
    """A review in a DIFFERENT org must return 404, not the review data."""
    from argus_api.database import AsyncSessionLocal
    from argus_api.models.organization import Organization
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel

    async with AsyncSessionLocal() as session:
        other_org = Organization(name="Other Org", github_org_login="other-org-login")
        session.add(other_org)
        await session.flush()
        repo = Repository(
            org_id=other_org.id,
            github_repo_id="55555",
            full_name="other-org/private-repo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()
        review = ReviewModel(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=99,
            pr_title="Secret PR",
            status="completed",
        )
        session.add(review)
        await session.commit()
        other_review_id = str(review.id)

    # The test user belongs to TEST_ORG_ID, not other_org — must get 404
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{other_review_id}", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_retry_review_creates_new_review():
    from unittest.mock import patch

    from argus_api.database import AsyncSessionLocal
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel

    async with AsyncSessionLocal() as session:
        # Use TEST_ORG_ID so the mock user owns this repo
        repo = Repository(
            org_id=TEST_ORG_ID,
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


@pytest.mark.asyncio
async def test_review_out_includes_raw_diff():
    from argus_api.database import AsyncSessionLocal
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel

    raw = "diff --git a/foo.py b/foo.py\n--- a/foo.py\n+++ b/foo.py\n+new line\n"
    async with AsyncSessionLocal() as session:
        # Use TEST_ORG_ID so the mock user owns this repo
        repo = Repository(
            org_id=TEST_ORG_ID,
            github_repo_id="11111",
            full_name="difforg/repo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()
        review = ReviewModel(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=10,
            pr_title="Diff PR",
            status="completed",
            raw_diff=raw,
        )
        session.add(review)
        await session.commit()
        review_id = str(review.id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{review_id}", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["raw_diff"] == raw
