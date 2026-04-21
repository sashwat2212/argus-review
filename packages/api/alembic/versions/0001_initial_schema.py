"""Initial schema: organizations, users, repositories, reviews, findings

Revision ID: 0001
Revises:
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("github_org_login", sa.String(255), nullable=False, unique=True),
        sa.Column("plan", sa.String(50), nullable=False, server_default="free"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_orgs_login", "organizations", ["github_org_login"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("org_id", sa.UUID(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("github_login", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_org_login", "users", ["org_id", "github_login"], unique=True)

    op.create_table(
        "repositories",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("org_id", sa.UUID(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("github_repo_id", sa.String(100), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("default_branch", sa.String(255), nullable=False, server_default="main"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("config", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_repos_github_id", "repositories", ["github_repo_id"], unique=True)

    op.create_table(
        "reviews",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("repo_id", sa.UUID(), sa.ForeignKey("repositories.id"), nullable=False),
        sa.Column("triggered_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=False, server_default="webhook"),
        sa.Column("pr_number", sa.Integer()),
        sa.Column("pr_title", sa.String(500)),
        sa.Column("base_sha", sa.String(40)),
        sa.Column("head_sha", sa.String(40)),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("score", sa.Integer()),
        sa.Column("total_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("completed_at", sa.DateTime()),
    )
    op.create_index("ix_reviews_repo_status", "reviews", ["repo_id", "status"])
    op.create_index("ix_reviews_pr_number", "reviews", ["pr_number"])

    op.create_table(
        "findings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("review_id", sa.UUID(), sa.ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("line_start", sa.Integer(), nullable=False),
        sa.Column("line_end", sa.Integer(), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("why_it_matters", sa.Text()),
        sa.Column("suggested_fix", sa.Text()),
        sa.Column("agent", sa.String(50)),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_findings_review_severity", "findings", ["review_id", "severity"])
    op.create_index("ix_findings_file_path", "findings", ["file_path"])


def downgrade() -> None:
    op.drop_table("findings")
    op.drop_table("reviews")
    op.drop_table("repositories")
    op.drop_table("users")
    op.drop_table("organizations")
