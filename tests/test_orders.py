from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Order, StockMovement
from tests.conftest import create_customer, create_product


@pytest.fixture
def customer(db):
    return create_customer(db)


def order(client, customer, *items, key=None):
    headers = {"Idempotency-Key": key} if key else {}
    body = {"customer_id": customer.id, "items": [{"product_id": p.id, "quantity": q} for p, q in items]}
    return client.post("/orders", json=body, headers=headers)


def count(db, model, *where):
    return db.scalar(select(func.count()).select_from(model).where(*where))


def stock(db, product):
    db.refresh(product)
    return product.stock_quantity


# ---- Criação -----------------------------------------------------------------------


def test_create_order(client, db, customer):
    a = create_product(db, sku="A", stock_quantity=10, unit_price=Decimal("2.50"))
    b = create_product(db, sku="B", stock_quantity=5, unit_price=Decimal("19.90"))

    r = order(client, customer, (a, 4), (b, 2))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "CONFIRMED"
    assert body["total_amount"] == "49.80"  # 4 x 2.50 + 2 x 19.90
    assert [(i["sku"], i["quantity"], i["unit_price"], i["subtotal"]) for i in body["items"]] == [
        ("A", 4, "2.50", "10.00"),
        ("B", 2, "19.90", "39.80"),
    ]
    assert stock(db, a) == 6
    assert stock(db, b) == 3

    moves = db.scalars(select(StockMovement).where(StockMovement.order_id == body["id"])).all()
    assert sorted((m.product_id, m.movement_type, m.reason, m.quantity, m.balance_after) for m in moves) == sorted(
        [(a.id, "OUT", "SALE", 4, 6), (b.id, "OUT", "SALE", 2, 3)]
    )


def test_repeated_product_lines_are_merged(client, db, customer):
    p = create_product(db, stock_quantity=10)
    body = order(client, customer, (p, 2), (p, 3)).json()
    assert [(i["product_id"], i["quantity"]) for i in body["items"]] == [(p.id, 5)]
    assert stock(db, p) == 5


def test_client_cannot_send_price_or_total(client, db, customer):
    p = create_product(db, stock_quantity=10)
    r = client.post(
        "/orders",
        json={"customer_id": customer.id, "total_amount": "0.01", "items": [{"product_id": p.id, "quantity": 1}]},
    )
    assert r.status_code == 422
    r = client.post(
        "/orders",
        json={"customer_id": customer.id, "items": [{"product_id": p.id, "quantity": 1, "unit_price": "0.01"}]},
    )
    assert r.status_code == 422


def test_order_with_one_item_out_of_stock_changes_nothing(client, db, customer):
    """Regra 3: um item sem estoque derruba o pedido inteiro."""
    ok = create_product(db, sku="OK", stock_quantity=10)
    short = create_product(db, sku="POUCO", stock_quantity=1)

    r = order(client, customer, (ok, 2), (short, 3))
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["code"] == "INSUFFICIENT_STOCK"
    assert "POUCO (disponível 1, solicitado 3)" in error["message"]
    assert stock(db, ok) == 10
    assert stock(db, short) == 1
    assert count(db, Order) == 0
    assert count(db, StockMovement) == 0


def test_inactive_product_rejected(client, db, customer):
    p = create_product(db, sku="OFF", stock_quantity=10, is_active=False)
    r = order(client, customer, (p, 1))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "PRODUCT_INACTIVE"
    assert stock(db, p) == 10


def test_unknown_product_or_customer(client, db, customer):
    p = create_product(db, stock_quantity=10)
    r = client.post("/orders", json={"customer_id": customer.id, "items": [{"product_id": 999999, "quantity": 1}]})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "PRODUCT_NOT_FOUND"
    r = client.post("/orders", json={"customer_id": 999999, "items": [{"product_id": p.id, "quantity": 1}]})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "CUSTOMER_NOT_FOUND"


@pytest.mark.parametrize("items", [[], [{"product_id": 1, "quantity": 0}], [{"product_id": 1, "quantity": -2}]])
def test_invalid_items(client, customer, items):
    assert client.post("/orders", json={"customer_id": customer.id, "items": items}).status_code == 422


def test_price_change_does_not_affect_existing_order(client, db, customer):
    """Regra 5: o item guarda o preço da época."""
    p = create_product(db, stock_quantity=10, unit_price=Decimal("10.00"))
    order_id = order(client, customer, (p, 2)).json()["id"]
    client.patch(f"/products/{p.id}", json={"unit_price": "99.00"})
    body = client.get(f"/orders/{order_id}").json()
    assert body["items"][0]["unit_price"] == "10.00"
    assert body["total_amount"] == "20.00"


# ---- Idempotência ------------------------------------------------------------------


def test_same_idempotency_key_returns_original_order(client, db, customer):
    p = create_product(db, stock_quantity=10)
    first = order(client, customer, (p, 3), key="pedido-123")
    second = order(client, customer, (p, 3), key="pedido-123")
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.headers["Idempotent-Replayed"] == "true"
    assert second.json()["id"] == first.json()["id"]
    assert stock(db, p) == 7  # baixou uma vez só
    assert count(db, Order) == 1


def test_idempotency_key_with_different_content(client, db, customer):
    p = create_product(db, stock_quantity=10)
    order(client, customer, (p, 3), key="k")
    r = order(client, customer, (p, 4), key="k")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert stock(db, p) == 7


def test_failed_order_does_not_burn_the_key(client, db, customer):
    """Se o pedido falhou, a mesma chave pode ser usada de novo depois de repor o estoque."""
    p = create_product(db, stock_quantity=1)
    assert order(client, customer, (p, 2), key="retry").status_code == 409
    client.post(f"/products/{p.id}/movements", json={"movement_type": "IN", "quantity": 5, "reason": "PURCHASE"})
    assert order(client, customer, (p, 2), key="retry").status_code == 201


def test_without_key_each_request_creates_an_order(client, db, customer):
    p = create_product(db, stock_quantity=10)
    order(client, customer, (p, 1))
    order(client, customer, (p, 1))
    assert count(db, Order) == 2


# ---- Cancelamento ------------------------------------------------------------------


def test_cancel_returns_stock(client, db, customer):
    a = create_product(db, stock_quantity=10)
    b = create_product(db, stock_quantity=10)
    order_id = order(client, customer, (a, 4), (b, 1)).json()["id"]

    r = client.post(f"/orders/{order_id}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELLED"
    assert stock(db, a) == 10
    assert stock(db, b) == 10
    reasons = db.scalars(
        select(StockMovement.reason).where(StockMovement.order_id == order_id).order_by(StockMovement.id)
    ).all()
    assert reasons == ["SALE", "SALE", "CANCELLATION", "CANCELLATION"]


def test_cancel_twice_returns_stock_once(client, db, customer):
    """Regra 6: o segundo cancelamento não devolve nada."""
    p = create_product(db, stock_quantity=10)
    order_id = order(client, customer, (p, 4)).json()["id"]
    assert client.post(f"/orders/{order_id}/cancel").status_code == 200

    r = client.post(f"/orders/{order_id}/cancel")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "ORDER_ALREADY_CANCELLED"
    assert stock(db, p) == 10
    assert count(db, StockMovement, StockMovement.reason == "CANCELLATION") == 1


def test_cancel_works_even_if_product_was_deactivated(client, db, customer):
    p = create_product(db, stock_quantity=10)
    order_id = order(client, customer, (p, 4)).json()["id"]
    client.patch(f"/products/{p.id}", json={"is_active": False})
    assert client.post(f"/orders/{order_id}/cancel").status_code == 200
    assert stock(db, p) == 10


def test_cancel_not_found(client):
    assert client.post("/orders/999999/cancel").status_code == 404
    assert client.get("/orders/999999").status_code == 404


# ---- Consulta ----------------------------------------------------------------------


def test_list_orders_with_filters(client, db, customer):
    other = create_customer(db)
    p = create_product(db, stock_quantity=100)
    o1 = order(client, customer, (p, 1)).json()["id"]
    o2 = order(client, customer, (p, 1)).json()["id"]
    o3 = order(client, other, (p, 1)).json()["id"]
    client.post(f"/orders/{o2}/cancel")

    def ids(**params):
        return [o["id"] for o in client.get("/orders", params=params).json()["items"]]

    assert ids() == [o3, o2, o1]  # mais recentes primeiro
    assert ids(customer_id=customer.id) == [o2, o1]
    assert ids(customer_id=customer.id, status="CONFIRMED") == [o1]
    assert ids(status="CANCELLED") == [o2]
    page = client.get("/orders", params={"page_size": 2}).json()
    assert page["total"] == 3
    assert "items" not in page["items"][0]  # a lista traz o resumo; os itens ficam no detalhe
    assert page["items"][0]["customer_name"] == other.name


def test_list_orders_by_date(client, db, customer):
    p = create_product(db, stock_quantity=10)
    created = order(client, customer, (p, 1)).json()["created_at"][:10]
    assert client.get("/orders", params={"created_from": created, "created_to": created}).json()["total"] == 1
    assert client.get("/orders", params={"created_from": "2000-01-01", "created_to": "2000-01-31"}).json()["total"] == 0
    assert client.get("/orders", params={"created_from": "2000-02-01", "created_to": "2000-01-01"}).status_code == 422
