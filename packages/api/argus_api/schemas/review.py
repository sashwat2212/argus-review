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
    github_comment_status: str | None = None
    raw_diff: str | None = None
    repo_full_name: str | None = None
    findings: list[FindingOut] = []


class ReviewListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int


class ReviewRetryOut(BaseModel):
    review_id: uuid.UUID
    status: str


class OverviewStats(BaseModel):
    total_reviews: int
    completed_reviews: int
    avg_score: float | None
    pass_rate: float | None
    open_findings: int
    total_findings: int

class ScorePoint(BaseModel):
    date: str
    score: float
    pr_title: str | None

class SeverityCount(BaseModel):
    severity: str
    count: int

class CategoryCount(BaseModel):
    category: str
    count: int


# ── New v2 schemas ──────────────────────────────────────────

class RepositoryHealthItem(BaseModel):
    repo_id: uuid.UUID
    full_name: str
    total_reviews: int
    avg_score: float | None
    open_findings: int
    last_review_at: datetime | None


class AgentBreakdownItem(BaseModel):
    agent: str
    total: int
    resolved: int
    resolution_rate: float


class VelocityPoint(BaseModel):
    date: str
    opened: int
    resolved: int


class ScoreDistributionItem(BaseModel):
    band: str   # e.g. "0–20", "21–40" …
    count: int


class TopFileItem(BaseModel):
    file_path: str
    count: int


class ReviewDurationStats(BaseModel):
    avg_seconds: float | None
    min_seconds: float | None
    max_seconds: float | None


class ReviewStatsOut(BaseModel):
    severity_breakdown: list[SeverityCount]
    agent_breakdown: list[AgentBreakdownItem]
    total_findings: int
    resolved_findings: int
