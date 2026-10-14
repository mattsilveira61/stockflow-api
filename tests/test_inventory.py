from sqlalchemy import func, select

from app.models import StockMovement
from tests.conftest import create_product


def move(client, product, movement_type="IN", quantity=10, reason="PURCHASE", **kw):
    body = {"movement_type": movement_type, "quantity": quantity, "reason": reason} | kw
    return client.post(f"/products/{product.id}/movements", json=body)


def movement_count(db, product):
    return db.scalar(select(func.count()).select_from(StockMovement).where(StockMovement.product_id == product.id))


def test_inbound_increases_stock(client, db):
    p = create_product(db)
    r = move(client, p, quantity=10, note="NF 123")
    assert r.status_code == 201
    body = r.json()
    assert body["balance_after"] == 10
    assert body["note"] == "NF 123"
    assert body["order_id"] is None
    db.refresh(p)
    assert p.stock_quantity == 10


def test_outbound_decreases_stock(client, db):
    p = create_product(db, stock_quantity=10)
    r = move(client, p, "OUT", 4, "ADJUSTMENT", note="Avaria")
    assert r.status_code == 201
    assert r.json()["balance_after"] == 6
    db.refresh(p)
    assert p.stock_quantity == 6


def test_outbound_can_reach_zero(client, db):
    p = create_product(db, stock_quantity=5)
    assert move(client, p, "OUT", 5, "ADJUSTMENT").json()["balance_after"] == 0


def test_outbound_above_stock_rejected_without_changes(client, db):
    """Regra 1: com 4 disponíveis, uma saída de 6 é recusada e nada muda."""
    p = create_product(db, stock_quantity=4)
    r = move(client, p, "OUT", 6, "ADJUSTMENT")
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["code"] == "INSUFFICIENT_STOCK"
    assert "disponível 4" in error["message"]
    db.refresh(p)
    assert p.stock_quantity == 4
    assert movement_count(db, p) == 0


def test_quantity_must_be_positive(client, db):
    p = create_product(db)
    assert move(client, p, quantity=0).status_code == 422
    assert move(client, p, quantity=-3).status_code == 422
    assert move(client, p, quantity=1.5).status_code == 422


def test_invalid_type_and_reason(client, db):
    p = create_product(db)
    assert move(client, p, movement_type="SIDEWAYS").status_code == 422
    # SALE e CANCELLATION só podem ser gerados pelos pedidos
    assert move(client, p, "OUT", 1, "SALE").status_code == 422
    assert move(client, p, "IN", 1, "CANCELLATION").status_code == 422
    # Compra não pode ser saída
    assert move(client, p, "OUT", 1, "PURCHASE").status_code == 422


def test_product_not_found(client):
    r = client.post("/products/999999/movements", json={"movement_type": "IN", "quantity": 1, "reason": "PURCHASE"})
    assert r.status_code == 404
    assert client.get("/products/999999/movements").status_code == 404


def test_inactive_product_rejected(client, db):
    p = create_product(db, is_active=False)
    r = move(client, p)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "PRODUCT_INACTIVE"


def test_history_newest_first_with_running_balance(client, db):
    p = create_product(db)
    move(client, p, "IN", 10, "PURCHASE")
    move(client, p, "OUT", 3, "ADJUSTMENT")
    move(client, p, "IN", 5, "PURCHASE")

    body = client.get(f"/products/{p.id}/movements").json()
    assert body["total"] == 3
    assert [(m["movement_type"], m["quantity"], m["balance_after"]) for m in body["items"]] == [
        ("IN", 5, 12),
        ("OUT", 3, 7),
        ("IN", 10, 10),
    ]


def test_history_only_for_that_product(client, db):
    a, b = create_product(db), create_product(db)
    move(client, a)
    move(client, b)
    move(client, b)
    assert client.get(f"/products/{a.id}/movements").json()["total"] == 1


def test_history_pagination(client, db):
    p = create_product(db)
    for _ in range(3):
        move(client, p, quantity=1)
    body = client.get(f"/products/{p.id}/movements", params={"page_size": 2, "page": 2}).json()
    assert body["pages"] == 2
    assert [m["balance_after"] for m in body["items"]] == [1]


def test_low_stock_report(client, db):
    """Regra 9: ativo e stock_quantity <= min_stock; os mais críticos primeiro."""
    below = create_product(db, sku="LOW-1", stock_quantity=2, min_stock=10)  # 8 abaixo
    at_min = create_product(db, sku="LOW-2", stock_quantity=5, min_stock=5)  # no limite
    zero = create_product(db, sku="LOW-3", stock_quantity=0, min_stock=3)  # 3 abaixo
    create_product(db, sku="OK-1", stock_quantity=6, min_stock=5)  # acima
    create_product(db, sku="OFF-1", stock_quantity=0, min_stock=5, is_active=False)  # inativo

    body = client.get("/reports/low-stock").json()
    assert body["total"] == 3
    assert [p["sku"] for p in body["items"]] == [below.sku, zero.sku, at_min.sku]


def test_low_stock_updates_after_movement(client, db):
    p = create_product(db, stock_quantity=1, min_stock=5)
    assert client.get("/reports/low-stock").json()["total"] == 1
    move(client, p, quantity=10)
    assert client.get("/reports/low-stock").json()["total"] == 0
