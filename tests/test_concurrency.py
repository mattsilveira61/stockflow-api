"""Concorrência de verdade: várias conexões ao mesmo tempo, cada uma com sua transação.

Estes testes não usam a fixture `db` (transação com rollback), porque nela tudo roda numa
conexão só e os locks nunca disputariam nada. Cada thread abre a própria sessão e os
dados criados são apagados no final.
"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ConflictError
from app.models import Category, Customer, Order, OrderItem, Product, StockMovement
from app.schemas.order import OrderCreate
from app.services import orders

THREADS = 10


@pytest.fixture
def make_session(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    with factory() as s:  # limpa tudo o que estes testes criaram
        for model in (StockMovement, OrderItem, Order, Product, Category, Customer):
            s.execute(delete(model))
        s.commit()


@pytest.fixture
def scenario(make_session):
    """Dois produtos com 5 unidades cada e um cliente, gravados de verdade no banco."""
    with make_session() as s:
        cat = Category(name="Concorrência")
        a = Product(sku="RACE-A", name="A", unit_price=Decimal("1.00"), stock_quantity=5, category=cat)
        b = Product(sku="RACE-B", name="B", unit_price=Decimal("1.00"), stock_quantity=5, category=cat)
        c = Customer(name="Cliente", email="race@exemplo.com")
        s.add_all([a, b, c])
        s.commit()
        return a.id, b.id, c.id


def run_in_parallel(make_session, fn):
    """Roda `fn(session, i)` em THREADS threads que partem juntas (barreira)."""
    barrier = Barrier(THREADS)

    def worker(i):
        with make_session() as s:
            barrier.wait()
            try:
                fn(s, i)
                return "ok"
            except ConflictError as e:
                return e.code

    with ThreadPoolExecutor(THREADS) as ex:
        return list(ex.map(worker, range(THREADS)))


def stock_of(make_session, *ids):
    with make_session() as s:
        return [s.get(Product, i).stock_quantity for i in ids]


def test_no_overselling_last_units(make_session, scenario):
    """Regra 4: 10 pedidos simultâneos de 1 unidade, só existem 5. Vendem-se exatamente 5."""
    a, _, customer = scenario

    def buy(s: Session, i):
        orders.create_order(s, OrderCreate(customer_id=customer, items=[{"product_id": a, "quantity": 1}]))

    results = run_in_parallel(make_session, buy)
    assert results.count("ok") == 5
    assert results.count("INSUFFICIENT_STOCK") == 5
    assert stock_of(make_session, a) == [0]
    with make_session() as s:
        assert s.scalar(select(func.count()).select_from(Order)) == 5
        balances = s.scalars(select(StockMovement.balance_after).order_by(StockMovement.id)).all()
        assert balances == [4, 3, 2, 1, 0]


def test_opposite_item_order_does_not_deadlock(make_session, scenario):
    """Metade pede [A, B], metade [B, A]. Os locks em ordem de id evitam deadlock."""
    a, b, customer = scenario

    def buy(s: Session, i):
        items = [{"product_id": a, "quantity": 1}, {"product_id": b, "quantity": 1}]
        orders.create_order(s, OrderCreate(customer_id=customer, items=items if i % 2 else items[::-1]))

    results = run_in_parallel(make_session, buy)
    assert results.count("ok") == 5
    assert set(results) == {"ok", "INSUFFICIENT_STOCK"}  # nenhum erro de deadlock
    assert stock_of(make_session, a, b) == [0, 0]


def test_concurrent_cancel_returns_stock_once(make_session, scenario):
    a, _, customer = scenario
    with make_session() as s:
        order, _ = orders.create_order(s, OrderCreate(customer_id=customer, items=[{"product_id": a, "quantity": 3}]))
    assert stock_of(make_session, a) == [2]

    results = run_in_parallel(make_session, lambda s, i: orders.cancel_order(s, order.id))
    assert results.count("ok") == 1
    assert results.count("ORDER_ALREADY_CANCELLED") == THREADS - 1
    assert stock_of(make_session, a) == [5]


def test_concurrent_requests_with_same_idempotency_key(make_session, scenario):
    a, _, customer = scenario
    data = OrderCreate(customer_id=customer, items=[{"product_id": a, "quantity": 2}])
    created = []

    def buy(s: Session, i):
        order, was_created = orders.create_order(s, data, idempotency_key="mesma-chave")
        created.append((order.id, was_created))

    assert run_in_parallel(make_session, buy) == ["ok"] * THREADS
    assert len({order_id for order_id, _ in created}) == 1  # todos receberam o mesmo pedido
    assert sum(was_created for _, was_created in created) == 1
    assert stock_of(make_session, a) == [3]
