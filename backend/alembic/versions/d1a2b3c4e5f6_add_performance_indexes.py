"""add performance indexes on repo_url and saved_at

Revision ID: d1a2b3c4e5f6
Revises: c3d4e5f6a7b8
Create Date: 2026-07-04 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op  # type: ignore[attr-defined]

revision: str = "d1a2b3c4e5f6"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_analyses_repo_url", "analyses", ["repo_url"])
    op.create_index("ix_analyses_saved_at", "analyses", ["saved_at"])
    op.create_index(
        "ix_analyses_repo_url_saved_at", "analyses", ["repo_url", "saved_at"]
    )
    op.create_index("ix_monitored_repos_repo_url", "monitored_repos", ["repo_url"])


def downgrade() -> None:
    op.drop_index("ix_monitored_repos_repo_url", "monitored_repos")
    op.drop_index("ix_analyses_repo_url_saved_at", "analyses")
    op.drop_index("ix_analyses_saved_at", "analyses")
    op.drop_index("ix_analyses_repo_url", "analyses")
