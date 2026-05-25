from __future__ import annotations

import os
import uuid

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["GITHUB_CLIENT_ID"] = "test-client-id"
os.environ["GITHUB_CLIENT_SECRET"] = "test-client-secret"

import pytest  # noqa: E402
from argus_api.auth_utils import create_access_token  # noqa: E402
from argus_api.config import settings  # noqa: E402
from argus_api.database import AsyncSessionLocal, Base, engine  # noqa: E402
from argus_api.dependencies import get_current_user, require_api_key  # noqa: E402
from argus_api.main import app  # noqa: E402
from argus_api.models.organization import Organization  # noqa: E402
from argus_api.models.user import User  # noqa: E402

settings.api_key = "test-api-key"

# ---------------------------------------------------------------------------
# Shared test user identity
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_ORG_ID = uuid.uuid4()

_test_user = User(
    id=TEST_USER_ID,
    org_id=TEST_ORG_ID,
    github_id=12345,
    github_login="testuser",
    email="test@example.com",
    avatar_url="https://avatars.githubusercontent.com/u/12345",
    role="owner",
)

TEST_JWT = create_access_token(
    {"sub": str(TEST_USER_ID), "github_login": "testuser"}
)
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_JWT}"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_test_env():
    """
    For every test:
      1. Override require_api_key and get_current_user to bypass auth.
      2. Reset the DB schema.
      3. Seed the test Organisation row (required by FK constraints).
    """
    # Bypass static key check (used by most routers)
    app.dependency_overrides[require_api_key] = lambda: None

    # Bypass JWT user lookup (used by /auth/me etc.)
    async def _mock_user() -> User:
        return _test_user

    app.dependency_overrides[get_current_user] = _mock_user

    # Reset DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # Seed org so FK constraints are satisfied in tests that create repos/reviews
    async with AsyncSessionLocal() as session:
        org = Organization(
            id=TEST_ORG_ID,
            name="Test Org",
            github_org_login="testorg-seed",
        )
        session.add(org)
        await session.commit()

    yield

    # Clean up overrides after each test
    app.dependency_overrides.pop(require_api_key, None)
    app.dependency_overrides.pop(get_current_user, None)
