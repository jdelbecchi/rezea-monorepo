"""add is_exported to orders

Revision ID: 1d67c270156a
Revises: b4d916d2740a
Create Date: 2026-07-09 20:29:41.496957

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1d67c270156a'
down_revision = 'b4d916d2740a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('is_exported', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('orders', 'is_exported')

