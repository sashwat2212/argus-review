"""Add raw_diff to reviews

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("raw_diff", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviews", "raw_diff")
