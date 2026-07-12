"""add_last_modified_by_to_orders

Revision ID: 22e264f7ecb4
Revises: a50909154f37
Create Date: 2026-07-11 23:25:27.651270

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '22e264f7ecb4'
down_revision = 'a50909154f37'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('last_modified_by_id', sa.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_orders_last_modified_by', 'orders', 'users', ['last_modified_by_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_orders_last_modified_by', 'orders', type_='foreignkey')
    op.drop_column('orders', 'last_modified_by_id')
