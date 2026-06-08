from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base

if TYPE_CHECKING:
    from argus_api.models.organization import Organization
    from argus_api.models.review import Review


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=True)
    github_login: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    role: Mapped[str] = mapped_column(String(50), default="member")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organization: Mapped[Organization] = relationship("Organization", back_populates="users")
    triggered_reviews: Mapped[list[Review]] = relationship(
        "Review", back_populates="triggered_by_user"
    )
