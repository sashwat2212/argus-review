from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base

if TYPE_CHECKING:
    from argus_api.models.organization import Organization
    from argus_api.models.review import Review


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    github_repo_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    is_active: Mapped[bool] = mapped_column(default=True)
    config: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organization: Mapped[Organization] = relationship("Organization", back_populates="repositories")
    reviews: Mapped[list[Review]] = relationship("Review", back_populates="repository")
