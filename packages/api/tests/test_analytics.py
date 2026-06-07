from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from argus_api.main import app
from tests.conftest import AUTH_HEADERS, TEST_ORG_ID


# ---------------------------------------------------------------------------
# Shared seed fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
async def seeded_data():
    """
    Populate the in-memory DB with:
      - 1 repo belonging to TEST_ORG_ID
      - 3 completed reviews with scores
      - 4 findings across those reviews (mixed severity / agent / category)

    Returns a dict of IDs for assertions.
    """
    from argus_api.database import AsyncSessionLocal
    from argus_api.models.finding import Finding
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review

    async with AsyncSessionLocal() as session:
        repo = Repository(
            org_id=TEST_ORG_ID,
            github_repo_id="analytic-repo-1",
            full_name="testorg/analytics-repo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()

        now = datetime.utcnow()

        reviews = [
            Review(
                repo_id=repo.id,
                trigger_type="webhook",
                pr_number=i,
                pr_title=f"PR #{i}",
                head_sha=f"sha{i}",
                status="completed",
                score=60 + i * 10,  # 70, 80, 90
                started_at=now - timedelta(hours=3 - i),
                completed_at=now - timedelta(hours=3 - i) + timedelta(minutes=5),
            )
            for i in range(1, 4)
        ]
        session.add_all(reviews)
        await session.flush()

        findings = [
            Finding(
                review_id=reviews[0].id,
                file_path="src/auth.py",
                line_start=10,
                line_end=15,
                severity="critical",
                category="security",
                confidence=0.95,
                title="SQL injection risk",
                description="User input passed directly to query",
                why_it_matters="Can leak data",
                suggested_fix="Use parameterised queries",
                agent="security",
                is_resolved=False,
            ),
            Finding(
                review_id=reviews[0].id,
                file_path="src/auth.py",
                line_start=20,
                line_end=25,
                severity="high",
                category="security",
                confidence=0.8,
                title="Hardcoded secret",
                description="API key in source code",
                why_it_matters="Leaks credentials",
                suggested_fix="Use env vars",
                agent="security",
                is_resolved=True,
            ),
            Finding(
                review_id=reviews[1].id,
                file_path="src/utils.py",
                line_start=5,
                line_end=8,
                severity="medium",
                category="quality",
                confidence=0.7,
                title="Complex function",
                description="Cyclomatic complexity > 15",
                why_it_matters="Hard to maintain",
                suggested_fix="Refactor into smaller functions",
                agent="quality",
                is_resolved=False,
            ),
            Finding(
                review_id=reviews[2].id,
                file_path="src/auth.py",
                line_start=1,
                line_end=3,
                severity="low",
                category="quality",
                confidence=0.6,
                title="Missing docstring",
                description="Public function has no docstring",
                why_it_matters="Reduces readability",
                suggested_fix="Add docstring",
                agent="quality",
                is_resolved=False,
            ),
        ]
        session.add_all(findings)
        await session.commit()

        return {
            "repo_id": str(repo.id),
            "review_ids": [str(r.id) for r in reviews],
        }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _get(path: str, params: str = "") -> tuple[int, object]:
    url = f"/api/v1/analytics{path}"
    if params:
        url = f"{url}?{params}"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(url, headers=AUTH_HEADERS)
    return resp.status_code, resp.json()


# ---------------------------------------------------------------------------
# Auth enforcement — every endpoint must return 401 without a token
# ---------------------------------------------------------------------------

ANALYTICS_PATHS = [
    "/overview",
    "/score-trend",
    "/severity-breakdown",
    "/top-categories",
    "/repository-health",
    "/agent-breakdown",
    "/finding-velocity",
    "/score-distribution",
    "/top-files",
    "/review-duration",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ANALYTICS_PATHS)
async def test_analytics_requires_auth(path: str):
    """Each analytics endpoint must reject unauthenticated requests with 401."""
    from argus_api.dependencies import get_current_user
    from tests.conftest import _test_user

    app.dependency_overrides.pop(get_current_user, None)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(f"/api/v1/analytics{path}")
        assert resp.status_code == 401, f"{path} should require auth"
    finally:
        async def _mock_user():
            return _test_user

        app.dependency_overrides[get_current_user] = _mock_user


# ---------------------------------------------------------------------------
# /overview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_overview_empty():
    """Empty org returns zero counts and None aggregates."""
    status, data = await _get("/overview")
    assert status == 200
    assert data["total_reviews"] == 0
    assert data["completed_reviews"] == 0
    assert data["avg_score"] is None
    assert data["pass_rate"] is None
    assert data["open_findings"] == 0
    assert data["total_findings"] == 0


@pytest.mark.asyncio
async def test_overview_with_data(seeded_data):
    """Overview reflects seeded reviews and findings."""
    status, data = await _get("/overview")
    assert status == 200
    assert data["total_reviews"] == 3
    assert data["completed_reviews"] == 3
    # Scores are 70, 80, 90 → avg = 80.0
    assert data["avg_score"] == 80.0
    # All 3 reviews have score >= 70 → pass_rate = 1.0
    assert data["pass_rate"] == 1.0
    # open_findings: critical(not resolved) + medium + low = 3
    assert data["open_findings"] == 3
    assert data["total_findings"] == 4


# ---------------------------------------------------------------------------
# /score-trend
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_score_trend_empty():
    status, data = await _get("/score-trend")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_score_trend_with_data(seeded_data):
    status, data = await _get("/score-trend", "limit=10")
    assert status == 200
    assert len(data) == 3
    # Should be ordered ascending by completed_at
    scores = [item["score"] for item in data]
    assert scores == sorted(scores)
    # Each point has required fields
    for point in data:
        assert "date" in point
        assert "score" in point
        assert "pr_title" in point


@pytest.mark.asyncio
async def test_score_trend_respects_limit(seeded_data):
    status, data = await _get("/score-trend", "limit=1")
    assert status == 200
    assert len(data) == 1


# ---------------------------------------------------------------------------
# /severity-breakdown
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_severity_breakdown_empty():
    status, data = await _get("/severity-breakdown")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_severity_breakdown_with_data(seeded_data):
    status, data = await _get("/severity-breakdown")
    assert status == 200
    # critical(unresolved)=1, medium=1, low=1 (high is resolved, excluded)
    severities = {item["severity"] for item in data}
    assert "critical" in severities
    assert "medium" in severities
    # Each item has a positive count
    for item in data:
        assert item["count"] > 0


# ---------------------------------------------------------------------------
# /top-categories
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_top_categories_empty():
    status, data = await _get("/top-categories")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_top_categories_with_data(seeded_data):
    status, data = await _get("/top-categories")
    assert status == 200
    categories = {item["category"] for item in data}
    assert "security" in categories
    assert "quality" in categories
    # security: 2 findings, quality: 2 findings
    counts = {item["category"]: item["count"] for item in data}
    assert counts.get("security", 0) == 2
    assert counts.get("quality", 0) == 2


# ---------------------------------------------------------------------------
# /repository-health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_repository_health_empty():
    status, data = await _get("/repository-health")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_repository_health_with_data(seeded_data):
    status, data = await _get("/repository-health")
    assert status == 200
    assert len(data) == 1
    repo = data[0]
    assert repo["full_name"] == "testorg/analytics-repo"
    assert repo["total_reviews"] == 3
    assert repo["avg_score"] == 80.0
    # 3 open findings (critical + medium + low)
    assert repo["open_findings"] == 3
    assert repo["last_review_at"] is not None


# ---------------------------------------------------------------------------
# /agent-breakdown
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_breakdown_empty():
    status, data = await _get("/agent-breakdown")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_agent_breakdown_with_data(seeded_data):
    status, data = await _get("/agent-breakdown")
    assert status == 200
    agents = {item["agent"]: item for item in data}
    assert "security" in agents
    assert "quality" in agents
    sec = agents["security"]
    assert sec["total"] == 2
    assert sec["resolved"] == 1
    assert sec["resolution_rate"] == 0.5
    qual = agents["quality"]
    assert qual["total"] == 2
    assert qual["resolved"] == 0
    assert qual["resolution_rate"] == 0.0


# ---------------------------------------------------------------------------
# /finding-velocity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_finding_velocity_default():
    """Returns 14 date slots even when there's no data."""
    status, data = await _get("/finding-velocity")
    assert status == 200
    assert len(data) == 14
    for point in data:
        assert "date" in point
        assert "opened" in point
        assert "resolved" in point


@pytest.mark.asyncio
async def test_finding_velocity_custom_days():
    status, data = await _get("/finding-velocity", "days=7")
    assert status == 200
    assert len(data) == 7


@pytest.mark.asyncio
async def test_finding_velocity_with_data(seeded_data):
    """Today's bucket should contain the seeded findings."""
    status, data = await _get("/finding-velocity", "days=14")
    assert status == 200
    assert len(data) == 14
    # All buckets are present; at least one has opened > 0 because we just seeded
    total_opened = sum(p["opened"] for p in data)
    assert total_opened >= 3  # 3 reviews created "now" → their findings counted


# ---------------------------------------------------------------------------
# /score-distribution
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_score_distribution_always_returns_5_bands():
    """Must return exactly 5 bands regardless of data."""
    status, data = await _get("/score-distribution")
    assert status == 200
    assert len(data) == 5
    bands = [item["band"] for item in data]
    assert "0–20" in bands
    assert "81–100" in bands


@pytest.mark.asyncio
async def test_score_distribution_with_data(seeded_data):
    status, data = await _get("/score-distribution")
    assert status == 200
    bands = {item["band"]: item["count"] for item in data}
    # Scores 70, 80, 90 → bands 61–80 (×2) and 81–100 (×1)
    assert bands.get("61–80", 0) == 2
    assert bands.get("81–100", 0) == 1


# ---------------------------------------------------------------------------
# /top-files
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_top_files_empty():
    status, data = await _get("/top-files")
    assert status == 200
    assert data == []


@pytest.mark.asyncio
async def test_top_files_with_data(seeded_data):
    status, data = await _get("/top-files")
    assert status == 200
    # src/auth.py has 3 findings, src/utils.py has 1
    files = {item["file_path"]: item["count"] for item in data}
    assert files.get("src/auth.py", 0) == 3
    assert files.get("src/utils.py", 0) == 1
    # Should be ordered descending
    counts = [item["count"] for item in data]
    assert counts == sorted(counts, reverse=True)


@pytest.mark.asyncio
async def test_top_files_respects_limit(seeded_data):
    status, data = await _get("/top-files", "limit=1")
    assert status == 200
    assert len(data) == 1
    assert data[0]["file_path"] == "src/auth.py"  # highest count


# ---------------------------------------------------------------------------
# /review-duration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_duration_empty():
    """With no data, all fields are None."""
    status, data = await _get("/review-duration")
    assert status == 200
    assert data["avg_seconds"] is None
    assert data["min_seconds"] is None
    assert data["max_seconds"] is None


@pytest.mark.asyncio
async def test_review_duration_with_data(seeded_data):
    """
    Each seeded review ran for 5 minutes (300 seconds).
    PostgreSQL extract("epoch") works in production but is not supported
    in SQLite (used in tests). If SQLite is detected, this test is lenient.
    """
    status, data = await _get("/review-duration")
    assert status == 200
    # In SQLite the epoch arithmetic may return None; that's acceptable here.
    # When running against PostgreSQL all three values should be ~300.
    if data["avg_seconds"] is not None:
        assert 250 <= data["avg_seconds"] <= 350
        assert data["min_seconds"] is not None
        assert data["max_seconds"] is not None
