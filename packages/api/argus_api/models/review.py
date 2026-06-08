from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base

if TYPE_CHECKING:
    from argus_api.models.finding import Finding
    from argus_api.models.repository import Repository
    from argus_api.models.user import User


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    repo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repositories.id"), nullable=False)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(50), default="webhook")
    pr_number: Mapped[int | None]
    pr_title: Mapped[str | None] = mapped_column(String(500))
    base_sha: Mapped[str | None] = mapped_column(String(40))
    head_sha: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    score: Mapped[int | None]
    total_findings: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    github_comment_status: Mapped[str | None] = mapped_column(String(20))
    raw_diff: Mapped[str | None] = mapped_column(Text, nullable=True)

    repository: Mapped[Repository] = relationship("Repository", back_populates="reviews")
    triggered_by_user: Mapped[User | None] = relationship(
        "User", back_populates="triggered_reviews"
    )
    findings: Mapped[list[Finding]] = relationship(
        "Finding", back_populates="review", cascade="all, delete-orphan"
    )

    @property
    def repo_full_name(self) -> str | None:
        return self.repository.full_name if self.repository else None
