"""add_description_to_survey_campaigns

Revision ID: 3f5267cc2ad4
Revises: 3e5267cc2ad3
Create Date: 2026-05-25 20:03:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3f5267cc2ad4'
down_revision = '3e5267cc2ad3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('survey_campaigns', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('survey_campaigns', 'description')
