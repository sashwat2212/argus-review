import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["ARGUS_API_KEY"] = "test-api-key"

from argus_api.config import settings  # noqa: E402

settings.api_key = "test-api-key"
