from __future__ import annotations

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from argus_api.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    if credentials is None or credentials.credentials != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
