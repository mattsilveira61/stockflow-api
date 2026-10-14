"""O banco é a última linha de defesa: estas regras valem mesmo se a API tiver um bug."""

from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models import Order, OrderItem, OrderStatus, StockMovement
from tests.conftest import create_category, create_customer, create_product


def expect_violation(db, constraint: str):
    """Confere que o flush falha pela constraint esperada e desfaz só aquela tentativa."""
    with pytest.raises(IntegrityError) as exc, db.begin_nested():
        db.flush()
    assert constraint in str(exc.value)


def test_migration_creates_all_tables(db):
    tables = set(db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).scalars())
    assert {"categories", "products", "customers", "orders", "order_items", "stock_movements"} <= tables


def test_product_defaults(db):
    p = create_product(db)
    db.refresh(p)
    assert p.stock_quantity == 0
    assert p.min_stock == 0
    assert p.is_active is True


def test_sku_unique(db):
    create_product(db, sku="DUP-1")
    with pytest.raises(IntegrityError) as exc, db.begin_nested():
        create_product(db, sku="DUP-1")
    assert "uq_products_sku" in str(exc.value)


def test_customer_email_unique(db):
    create_customer(db, email="a@exemplo.com")
    with pytest.raises(IntegrityError) as exc, db.begin_nested():
        create_customer(db, email="a@exemplo.com")
    assert "uq_customers_email" in str(exc.value)


def test_category_name_unique(db):
    create_category(db, name="Bebidas")
    with pytest.raises(IntegrityError) as exc, db.begin_nested():
        create_category(db, name="Bebidas")
    assert "uq_categories_name" in str(exc.value)


def test_stock_cannot_be_negative(db):
    p = create_product(db)
    p.stock_quantity = -1
    expect_violation(db, "ck_products_stock_non_negative")


def test_price_cannot_be_negative(db):
    p = create_product(db)
    p.unit_price = Decimal("-0.01")
    expect_violation(db, "ck_products_unit_price_non_negative")


def test_invalid_order_status(db):
    db.add(Order(customer=create_customer(db), status="PAID", total_amount=Decimal("0")))
    expect_violation(db, "ck_orders_status_valid")


def test_order_item_quantity_positive(db):
    order = Order(customer=create_customer(db), status=OrderStatus.CONFIRMED, total_amount=Decimal("0"))
    order.items.append(OrderItem(product=create_product(db), quantity=0, unit_price=Decimal("1")))
    db.add(order)
    expect_violation(db, "ck_order_items_quantity_positive")


def test_movement_quantity_positive(db):
    db.add(StockMovement(product=create_product(db), movement_type="IN", reason="PURCHASE", quantity=0, balance_after=0))
    expect_violation(db, "ck_stock_movements_quantity_positive")


def test_invalid_movement_reason(db):
    db.add(StockMovement(product=create_product(db), movement_type="IN", reason="GIFT", quantity=1, balance_after=1))
    expect_violation(db, "ck_stock_movements_reason_valid")


def test_idempotency_key_unique(db):
    c = create_customer(db)
    db.add(Order(customer=c, status=OrderStatus.CONFIRMED, total_amount=Decimal("0"), idempotency_key="k1"))
    db.flush()
    db.add(Order(customer=c, status=OrderStatus.CONFIRMED, total_amount=Decimal("0"), idempotency_key="k1"))
    expect_violation(db, "uq_orders_idempotency_key")


def test_movement_balance_after_non_negative(db):
    db.add(StockMovement(product=create_product(db), movement_type="OUT", reason="ADJUSTMENT", quantity=1, balance_after=-1))
    expect_violation(db, "ck_stock_movements_balance_after_non_negative")
