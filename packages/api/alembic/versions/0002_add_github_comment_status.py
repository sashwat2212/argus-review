"""Add github_comment_status to reviews

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("github_comment_status", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviews", "github_comment_status")
