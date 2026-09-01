"""add email_recipients to monitored_repos

Revision ID: c3d4e5f6a7b8
Revises: b8e423ca
Create Date: 2026-06-28 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op  # type: ignore[attr-defined]

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b8e423ca"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("monitored_repos", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("email_recipients", sa.String(length=500), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("monitored_repos", schema=None) as batch_op:
        batch_op.drop_column("email_recipients")
