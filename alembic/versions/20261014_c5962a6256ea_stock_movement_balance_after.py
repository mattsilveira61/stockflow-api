"""stock movement balance after

Revision ID: c5962a6256ea
Revises: 22313a8c69e3
Create Date: 2026-10-14 16:40:57.195949

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5962a6256ea'
down_revision: Union[str, Sequence[str], None] = '22313a8c69e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("stock_movements", sa.Column("balance_after", sa.Integer(), nullable=True))
    # Preenche as linhas já existentes com o saldo acumulado, na ordem em que aconteceram.
    op.execute(
        """
        UPDATE stock_movements m
        SET balance_after = t.balance
        FROM (
            SELECT id,
                   SUM(CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END)
                       OVER (PARTITION BY product_id ORDER BY created_at, id) AS balance
            FROM stock_movements
        ) t
        WHERE m.id = t.id
        """
    )
    op.alter_column("stock_movements", "balance_after", nullable=False)
    op.create_check_constraint(
        op.f("ck_stock_movements_balance_after_non_negative"), "stock_movements", "balance_after >= 0"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("ck_stock_movements_balance_after_non_negative"), "stock_movements", type_="check")
    op.drop_column("stock_movements", "balance_after")
