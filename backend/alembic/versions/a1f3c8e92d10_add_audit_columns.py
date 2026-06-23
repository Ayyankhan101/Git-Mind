"""add solidity_audit and code_audit columns

Revision ID: a1f3c8e92d10
Revises: cb948bd70aa2
Create Date: 2026-06-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op  # type: ignore[attr-defined]

revision: str = "a1f3c8e92d10"
down_revision: str | Sequence[str] | None = "cb948bd70aa2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("analyses", schema=None) as batch_op:
        batch_op.add_column(sa.Column("solidity_audit", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("code_audit", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("analyses", schema=None) as batch_op:
        batch_op.drop_column("code_audit")
        batch_op.drop_column("solidity_audit")
