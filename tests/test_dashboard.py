from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import update

from app.core import clock
from app.models import Order, StockMovement
from tests.conftest import create_customer, create_product


@pytest.fixture
def setup(client, db):
    """Três pedidos hoje (um cancelado), um há 10 dias e um há 40 dias."""
    c = create_customer(db)
    a = create_product(db, sku="A", unit_price=Decimal("10.00"), stock_quantity=100, min_stock=5)
    b = create_product(db, sku="B", unit_price=Decimal("2.50"), stock_quantity=100, min_stock=5)
    create_product(db, sku="LOW", unit_price=Decimal("1.00"), stock_quantity=2, min_stock=5)
    create_product(db, sku="ZERO", unit_price=Decimal("1.00"), stock_quantity=0, min_stock=1)
    create_product(db, sku="OFF", unit_price=Decimal("100.00"), stock_quantity=50, is_active=False)

    def order(*items, days_ago=0):
        body = {"customer_id": c.id, "items": [{"product_id": p.id, "quantity": q} for p, q in items]}
        r = client.post("/orders", json=body)
        assert r.status_code == 201
        if days_ago:
            when = clock.now() - timedelta(days=days_ago)
            db.execute(update(Order).where(Order.id == r.json()["id"]).values(created_at=when))
            db.commit()
        return r.json()["id"]

    order((a, 2), (b, 4))  # 30.00
    order((a, 1))  # 10.00
    cancelled = order((b, 10))  # 25.00, cancelado
    client.post(f"/orders/{cancelled}/cancel")
    order((b, 2), days_ago=10)  # 5.00
    order((a, 5), days_ago=40)  # 50.00, fora dos 30 dias
    return a, b


def test_kpis(client, setup):
    body = client.get("/dashboard", params={"days": 30}).json()
    k = body["kpis"]
    assert k["revenue"] == "45.00"
    assert k["orders"] == 3
    assert k["average_ticket"] == "15.00"
    assert k["cancelled_orders"] == 1
    assert k["items_sold"] == 2 + 4 + 1 + 2
    # Estoque atual dos ativos: A=92x10 + B=94x2.50 + LOW 2x1 + ZERO 0
    assert k["stock_value"] == "1157.00"
    assert k["active_products"] == 4
    assert k["low_stock_count"] == 2
    assert k["out_of_stock_count"] == 1


def test_period_changes_numbers(client, setup):
    assert client.get("/dashboard", params={"days": 60}).json()["kpis"]["revenue"] == "95.00"
    assert client.get("/dashboard", params={"days": 1}).json()["kpis"]["revenue"] == "40.00"


def test_sales_by_day_fills_empty_days(client, setup):
    body = client.get("/dashboard", params={"days": 30}).json()
    days = body["sales_by_day"]
    assert len(days) == 30
    assert days[0]["date"] == body["start"]
    assert days[-1]["date"] == body["end"] == clock.today().isoformat()
    assert days[-1] == {"date": body["end"], "orders": 2, "revenue": "40.00"}
    ten_days_ago = (clock.today() - timedelta(days=10)).isoformat()
    assert next(d for d in days if d["date"] == ten_days_ago)["revenue"] == "5.00"
    assert sum(d["orders"] for d in days) == 3
    assert sum(Decimal(d["revenue"]) for d in days) == Decimal("45.00")


def test_top_products(client, setup):
    a, b = setup
    top = client.get("/dashboard", params={"days": 30}).json()["top_products"]
    # Cancelado não conta: B vendeu 4 + 2 = 6, A vendeu 2 + 1 = 3
    assert [(t["sku"], t["quantity"], t["revenue"]) for t in top] == [("B", 6, "15.00"), ("A", 3, "30.00")]


def test_recent_movements(client, setup):
    recent = client.get("/dashboard").json()["recent_movements"]
    assert len(recent) == 7  # 6 vendas + 1 devolução; o limite é 10
    # O último pedido do setup (A x5) foi criado depois do cancelamento
    assert (recent[0]["sku"], recent[0]["reason"]) == ("A", "SALE")
    assert {"sku", "product_name", "balance_after"} <= set(recent[0])


def test_empty_database(client):
    body = client.get("/dashboard", params={"days": 7}).json()
    assert body["kpis"]["revenue"] == "0.00"
    assert body["kpis"]["average_ticket"] == "0.00"
    assert len(body["sales_by_day"]) == 7
    assert body["top_products"] == []


def test_days_limits(client):
    assert client.get("/dashboard", params={"days": 0}).status_code == 422
    assert client.get("/dashboard", params={"days": 367}).status_code == 422


def test_day_boundary_uses_local_time(client, db):
    """Pedido às 23h de ontem em São Paulo é 02h de hoje em UTC: deve contar como ontem."""
    c = create_customer(db)
    p = create_product(db, stock_quantity=10, unit_price=Decimal("7.00"))
    order_id = client.post("/orders", json={"customer_id": c.id, "items": [{"product_id": p.id, "quantity": 1}]}).json()["id"]
    late_yesterday = clock.start_of_day(clock.today()) - timedelta(hours=1)
    db.execute(update(Order).where(Order.id == order_id).values(created_at=late_yesterday))
    db.commit()
    days = client.get("/dashboard", params={"days": 2}).json()["sales_by_day"]
    assert [d["revenue"] for d in days] == ["7.00", "0.00"]


# ---- Histórico geral ---------------------------------------------------------------


def test_movements_history_with_filters(client, setup):
    a, b = setup
    body = client.get("/movements").json()
    assert body["total"] == 7  # 6 saídas de venda + 1 devolução
    first = body["items"][0]
    assert (first["sku"], first["reason"], first["quantity"]) == ("A", "SALE", 5)

    def total(**params):
        return client.get("/movements", params=params).json()["total"]

    assert total(product_id=a.id) == 3
    assert total(movement_type="IN") == 1
    assert total(reason="SALE") == 6
    assert total(product_id=b.id, reason="SALE") == 3


def test_movements_history_by_date(client, db, setup):
    today = clock.today().isoformat()
    # As movimentações do setup são todas de agora (só os pedidos foram "envelhecidos")
    assert client.get("/movements", params={"created_from": today, "created_to": today}).json()["total"] == 7
    db.execute(update(StockMovement).values(created_at=clock.now() - timedelta(days=3)))
    db.commit()
    assert client.get("/movements", params={"created_from": today}).json()["total"] == 0
    assert client.get("/movements", params={"created_from": "2000-02-01", "created_to": "2000-01-01"}).status_code == 422
