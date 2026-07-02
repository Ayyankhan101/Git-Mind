"""make schedule_cron nullable

Revision ID: b8e423ca
Revises: a1f3c8e92d10
Create Date: 2026-06-28 09:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op  # type: ignore[attr-defined]

revision: str = "b8e423ca"
down_revision: str | Sequence[str] | None = "a1f3c8e92d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("monitored_repos", schema=None) as batch_op:
        batch_op.alter_column(
            "schedule_cron",
            existing_type=sa.String(length=100),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("monitored_repos", schema=None) as batch_op:
        batch_op.alter_column(
            "schedule_cron",
            existing_type=sa.String(length=100),
            nullable=False,
        )
