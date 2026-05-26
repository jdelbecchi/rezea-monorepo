"""add_social_columns_to_tenants

Revision ID: 3e9dcfa6a789
Revises: 3f5267cc2ad4
Create Date: 2026-05-26 20:24:00.651099

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3e9dcfa6a789'
down_revision = '3f5267cc2ad4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('website_url', sa.String(length=500), nullable=True))
    op.add_column('tenants', sa.Column('facebook_url', sa.String(length=500), nullable=True))
    op.add_column('tenants', sa.Column('instagram_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'instagram_url')
    op.drop_column('tenants', 'facebook_url')
    op.drop_column('tenants', 'website_url')
