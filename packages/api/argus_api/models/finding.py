from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    review_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reviews.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    line_start: Mapped[int]
    line_end: Mapped[int]
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence: Mapped[float]
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    why_it_matters: Mapped[str] = mapped_column(Text)
    suggested_fix: Mapped[str] = mapped_column(Text)
    agent: Mapped[str] = mapped_column(String(50))
    is_resolved: Mapped[bool] = mapped_column(default=False)

    review: Mapped[Review] = relationship("Review", back_populates="findings")
