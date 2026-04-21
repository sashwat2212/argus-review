from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from argus_api.schemas.finding import FindingOut


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repo_id: uuid.UUID
    trigger_type: str
    pr_number: int | None
    pr_title: str | None
    base_sha: str | None
    head_sha: str | None
    status: str
    score: int | None
    total_findings: int
    started_at: datetime | None
    completed_at: datetime | None
    findings: list[FindingOut] = []


class ReviewListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int
