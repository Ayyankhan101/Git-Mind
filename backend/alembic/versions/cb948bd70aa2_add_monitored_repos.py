"""add_monitored_repos

Revision ID: cb948bd70aa2
Revises: 2b026dd78d2b
Create Date: 2026-06-21 17:50:12.754065

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb948bd70aa2'
down_revision: Union[str, Sequence[str], None] = '2b026dd78d2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('monitored_repos',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('repo_url', sa.String(length=1024), nullable=False),
        sa.Column('repo_name', sa.String(length=255), nullable=False),
        sa.Column('owner_hash', sa.String(length=64), nullable=True),
        sa.Column('slack_webhook_url', sa.String(length=500), nullable=True),
        sa.Column('schedule_cron', sa.String(length=100), nullable=False),
        sa.Column('score_delta_threshold', sa.Integer(), nullable=False),
        sa.Column('alert_on_new_findings', sa.Boolean(), nullable=False),
        sa.Column('last_sha', sa.String(length=64), nullable=True),
        sa.Column('last_session_id', sa.String(length=36), nullable=True),
        sa.Column('last_check_at', sa.Float(), nullable=True),
        sa.Column('created_at', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('monitored_repos', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_monitored_repos_repo_url'), ['repo_url'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('monitored_repos', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_monitored_repos_repo_url'))
    op.drop_table('monitored_repos')
