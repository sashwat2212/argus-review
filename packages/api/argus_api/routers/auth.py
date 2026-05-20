from __future__ import annotations

from fastapi import APIRouter, Depends

from argus_api.dependencies import require_api_key

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/verify")
async def verify(_auth: None = Depends(require_api_key)) -> dict:
    return {"status": "ok"}
