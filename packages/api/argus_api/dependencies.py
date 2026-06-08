from __future__ import annotations

import hmac
import uuid

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from argus_api.auth_utils import verify_token
from argus_api.config import settings
from argus_api.database import get_session
from argus_api.models.user import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    token = None
    # Check for Bearer token first (API access)
    if credentials:
        token = credentials.credentials
    # Fallback to cookie (Browser access)
    if not token:
        token = request.cookies.get("argus_session")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Static API keys are not supported for user endpoints — JWTs only.
    if token == settings.api_key:
        # Quick hack for backward compatibility with webhook tests if needed,
        # but webhooks should have their own dependency.
        raise HTTPException(status_code=401, detail="API keys not supported for user endpoints")

    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Token missing subject")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as err:
        raise HTTPException(status_code=401, detail="Invalid user ID in token") from err

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """Legacy dependency for webhooks or machine-to-machine calls."""
    if credentials is None or not hmac.compare_digest(credentials.credentials, settings.api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
