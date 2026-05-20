from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    review_id: uuid.UUID
    file_path: str
    line_start: int
    line_end: int
    severity: str
    category: str
    confidence: float
    title: str
    description: str
    why_it_matters: str
    suggested_fix: str
    agent: str
    is_resolved: bool


class FindingPatch(BaseModel):
    is_resolved: bool
