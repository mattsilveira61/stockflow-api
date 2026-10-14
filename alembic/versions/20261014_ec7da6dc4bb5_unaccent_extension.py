"""unaccent extension

Busca sem acento: "agua" encontra "Água". A extensão vem junto com o PostgreSQL (contrib).

Revision ID: ec7da6dc4bb5
Revises: c5962a6256ea
Create Date: 2026-10-14 19:28:17.233243

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ec7da6dc4bb5'
down_revision: Union[str, Sequence[str], None] = 'c5962a6256ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
