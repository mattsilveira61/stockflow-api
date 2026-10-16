import pytest
from sqlalchemy import case, func, select

from app.models import (
    Customer,
    MovementReason,
    Order,
    OrderStatus,
    Product,
    PurchaseOrder,
    PurchaseStatus,
    StockMovement,
    Supplier,
)
from app.seed import CUSTOMERS, NO_RESTOCK, PRODUCTS, SUPPLIERS, seed


@pytest.fixture
def seeded(db):
    seed(db)
    return db


def count(db, model, *where):
    return db.scalar(select(func.count()).select_from(model).where(*where))


def test_seed_creates_catalog_and_history(seeded):
    assert count(seeded, Product) == len(PRODUCTS)
    assert count(seeded, Customer) == len(CUSTOMERS)
    assert count(seeded, Order) >= 100
    assert 0 < count(seeded, Order, Order.status == OrderStatus.CANCELLED) < count(seeded, Order) / 4


def test_seed_is_idempotent(seeded):
    before = [count(seeded, m) for m in (Product, Customer, Order, StockMovement)]
    seed(seeded)
    assert [count(seeded, m) for m in (Product, Customer, Order, StockMovement)] == before


def test_stock_matches_history(seeded):
    """O saldo de cada produto é a soma das entradas menos as saídas, e o último balance_after."""
    signed = case((StockMovement.movement_type == "IN", StockMovement.quantity), else_=-StockMovement.quantity)
    for product in seeded.scalars(select(Product)):
        total = seeded.scalar(select(func.coalesce(func.sum(signed), 0)).where(StockMovement.product_id == product.id))
        last = seeded.scalar(
            select(StockMovement.balance_after)
            .where(StockMovement.product_id == product.id)
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .limit(1)
        )
        assert product.stock_quantity == total == last, product.sku


def test_history_is_spread_over_time(seeded):
    first, last = seeded.execute(select(func.min(Order.created_at), func.max(Order.created_at))).one()
    assert (last - first).days >= 50


def test_some_products_end_low_on_stock(seeded):
    low = set(seeded.scalars(select(Product.sku).where(Product.stock_quantity <= Product.min_stock)))
    assert low and low <= NO_RESTOCK


def test_seed_reposicoes_viram_compras_e_deixa_compras_abertas(seeded):
    assert count(seeded, Supplier) == len(set(SUPPLIERS.values()))
    assert count(seeded, PurchaseOrder, PurchaseOrder.status == PurchaseStatus.RECEIVED) > 0
    # Toda entrada por compra (fora o estoque inicial) aponta para o pedido de compra
    loose = StockMovement.reason == MovementReason.PURCHASE, StockMovement.purchase_order_id.is_(None)
    assert count(seeded, StockMovement, *loose, StockMovement.note != "Estoque inicial") == 0
    assert count(seeded, PurchaseOrder, PurchaseOrder.status == PurchaseStatus.ORDERED) == 1
    assert count(seeded, PurchaseOrder, PurchaseOrder.status == PurchaseStatus.DRAFT) == 1
