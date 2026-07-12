"""add_offer_snap_code

Revision ID: a50909154f37
Revises: 1d67c270156a
Create Date: 2026-07-11 21:56:11.870383

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a50909154f37'
down_revision = '1d67c270156a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add column
    op.add_column('orders', sa.Column('offer_snap_code', sa.String(length=50), nullable=True))
    
    # Backfill existing records using SQL UPDATE
    op.execute(
        "UPDATE orders "
        "SET offer_snap_code = offers.offer_code "
        "FROM offers "
        "WHERE orders.offer_id = offers.id"
    )


def downgrade() -> None:
    op.drop_column('orders', 'offer_snap_code')
