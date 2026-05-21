from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from argus_api.config import settings
from argus_api.database import get_session
from argus_api.dependencies import require_api_key, get_current_user
from argus_api.models.user import User
from argus_api.models.organization import Organization
from argus_api.auth_utils import create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/verify")
async def verify(_auth: None = Depends(require_api_key)) -> dict:
    return {"status": "ok"}


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)) -> dict:
    return {
        "id": str(user.id),
        "github_login": user.github_login,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "role": user.role,
        "org_id": str(user.org_id)
    }


@router.get("/github/login")
async def github_login():
    if not settings.github_client_id:
        raise HTTPException(status_code=500, detail="GitHub Client ID not configured")
    
    redirect_uri = f"https://github.com/login/oauth/authorize?client_id={settings.github_client_id}&scope=user:email"
    return RedirectResponse(redirect_uri)


@router.get("/github/callback")
async def github_callback(code: str, response: Response, session: AsyncSession = Depends(get_session)):
    if not code:
        raise HTTPException(status_code=400, detail="Code not provided")

    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to retrieve access token")

        # Fetch user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user profile")
        
        user_profile = user_res.json()
        github_id = user_profile.get("id")
        github_login = user_profile.get("login")
        email = user_profile.get("email")
        avatar_url = user_profile.get("avatar_url")

        # Upsert Organization (Personal Workspace for now)
        org_name = f"{github_login}'s Workspace"
        org_result = await session.execute(select(Organization).where(Organization.github_org_login == github_login))
        org = org_result.scalar_one_or_none()
        
        if not org:
            org = Organization(
                name=org_name,
                github_org_login=github_login,
                plan="free"
            )
            session.add(org)
            await session.flush()
        
        # Upsert User
        user_result = await session.execute(select(User).where(User.github_id == github_id))
        user = user_result.scalar_one_or_none()
        
        if not user:
            user = User(
                org_id=org.id,
                github_id=github_id,
                github_login=github_login,
                email=email,
                avatar_url=avatar_url,
                role="owner"
            )
            session.add(user)
        else:
            user.github_login = github_login
            user.email = email
            user.avatar_url = avatar_url
            
        await session.commit()
        await session.refresh(user)

        # Generate JWT token
        jwt_token = create_access_token({"sub": str(user.id), "github_login": user.github_login})
        
        # Redirect back to frontend
        frontend_url = settings.cors_origins[0] if settings.cors_origins else "http://localhost:5173"
        redirect_res = RedirectResponse(url=frontend_url)
        redirect_res.set_cookie(
            key="argus_session",
            value=jwt_token,
            httponly=True,
            samesite="lax",
            secure=False,  # Set to True in prod with HTTPS
            max_age=settings.access_token_expire_minutes * 60,
        )
        return redirect_res
