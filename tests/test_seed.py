from sqlalchemy import func, select

from app.models import Customer, Product, StockMovement
from app.seed import CUSTOMERS, PRODUCTS, seed


def test_seed_is_idempotent(db):
    seed(db)
    seed(db)
    assert db.scalar(select(func.count()).select_from(Product)) == len(PRODUCTS)
    assert db.scalar(select(func.count()).select_from(Customer)) == len(CUSTOMERS)
    # Uma movimentação de entrada por produto com saldo inicial, mesmo rodando duas vezes
    assert db.scalar(select(func.count()).select_from(StockMovement)) == sum(1 for p in PRODUCTS if p[4])


def test_seed_stock_matches_history(db):
    seed(db)
    for product in db.scalars(select(Product)):
        moved = db.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(StockMovement.product_id == product.id)
        )
        assert product.stock_quantity == moved
