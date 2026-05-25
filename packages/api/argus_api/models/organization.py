from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base

if TYPE_CHECKING:
    from argus_api.models.repository import Repository
    from argus_api.models.user import User


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    github_org_login: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    users: Mapped[list[User]] = relationship(
        "User", back_populates="organization"
    )
    repositories: Mapped[list[Repository]] = relationship(
        "Repository", back_populates="organization"
    )
