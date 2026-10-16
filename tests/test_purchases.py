from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import sessionmaker

from app.core.errors import ConflictError
from app.models import (
    Category,
    MovementReason,
    Product,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseStatus,
    StockMovement,
    Supplier,
)
from app.services import purchases
from tests.conftest import create_product


def create_supplier(db, **kw) -> Supplier:
    supplier = Supplier(name=kw.pop("name", "Distribuidora Central"), **kw)
    db.add(supplier)
    db.commit()
    return supplier


@pytest.fixture
def supplier(db):
    return create_supplier(db)


def purchase(client, supplier, *items, note=None):
    body = {
        "supplier_id": supplier.id,
        "items": [{"product_id": p.id, "quantity": q, "unit_cost": c} for p, q, c in items],
    }
    if note:
        body["note"] = note
    return client.post("/purchases", json=body)


def stock(db, product):
    db.refresh(product)
    return product.stock_quantity


# ---- Fornecedores -------------------------------------------------------------------


def test_cria_e_busca_fornecedor_sem_acento(client):
    r = client.post("/suppliers", json={"name": "  Hortifruti São João ", "email": "Vendas@SJ.com", "phone": "11 99999-0000"})
    assert r.status_code == 201
    assert (r.json()["name"], r.json()["email"]) == ("Hortifruti São João", "vendas@sj.com")

    found = client.get("/suppliers", params={"q": "sao joao"}).json()
    assert [s["name"] for s in found["items"]] == ["Hortifruti São João"]


def test_nome_de_fornecedor_unico_sem_diferenciar_maiusculas(client, supplier):
    r = client.post("/suppliers", json={"name": "DISTRIBUIDORA CENTRAL"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "SUPPLIER_NAME_TAKEN"


def test_desativa_e_apaga_contato_do_fornecedor(client, supplier):
    r = client.patch(f"/suppliers/{supplier.id}", json={"is_active": False, "email": None})
    assert (r.json()["is_active"], r.json()["email"]) == (False, None)
    assert client.get("/suppliers", params={"active": True}).json()["total"] == 0


def test_operador_cadastra_fornecedor_e_leitor_nao(operator_client, reader_client):
    assert reader_client.post("/suppliers", json={"name": "X"}).status_code == 403
    assert operator_client.post("/suppliers", json={"name": "X"}).status_code == 201


# ---- Rascunho -----------------------------------------------------------------------


def test_cria_rascunho_com_total_calculado_e_sem_mexer_no_estoque(client, db, supplier):
    a = create_product(db, stock_quantity=3)
    b = create_product(db)
    r = purchase(client, supplier, (b, 4, "2.50"), (a, 10, "1.99"), note="Reposição semanal")

    assert r.status_code == 201
    body = r.json()
    assert (body["status"], body["total_cost"], body["supplier_name"]) == ("DRAFT", "29.90", supplier.name)
    assert [i["product_id"] for i in body["items"]] == sorted([a.id, b.id])
    assert stock(db, a) == 3


def test_produto_repetido_na_compra_e_recusado(client, db, supplier):
    p = create_product(db)
    r = purchase(client, supplier, (p, 1, "1.00"), (p, 2, "1.00"))
    assert (r.status_code, r.json()["error"]["code"]) == (409, "DUPLICATE_ITEM")


def test_fornecedor_ou_produto_desativado_e_recusado(client, db, supplier):
    inactive = create_product(db, is_active=False)
    assert purchase(client, supplier, (inactive, 1, "1.00")).json()["error"]["code"] == "PRODUCT_INACTIVE"

    off = create_supplier(db, name="Fechada", is_active=False)
    assert purchase(client, off, (create_product(db), 1, "1.00")).json()["error"]["code"] == "SUPPLIER_INACTIVE"


@pytest.mark.parametrize("item", [{"quantity": 0, "unit_cost": "1"}, {"quantity": 1, "unit_cost": "-1"}])
def test_quantidade_e_custo_invalidos(client, db, supplier, item):
    p = create_product(db)
    r = client.post("/purchases", json={"supplier_id": supplier.id, "items": [{"product_id": p.id} | item]})
    assert r.status_code == 422


def test_edita_rascunho_substituindo_itens(client, db, supplier):
    a, b = create_product(db), create_product(db)
    pid = purchase(client, supplier, (a, 1, "5.00")).json()["id"]

    r = client.patch(f"/purchases/{pid}", json={"items": [{"product_id": b.id, "quantity": 3, "unit_cost": "2.00"}]})
    assert r.status_code == 200
    assert ([i["product_id"] for i in r.json()["items"]], r.json()["total_cost"]) == ([b.id], "6.00")


# ---- Fluxo de status ----------------------------------------------------------------


def test_fluxo_completo_da_entrada_no_estoque(client, db, supplier):
    a = create_product(db, stock_quantity=2)
    b = create_product(db, stock_quantity=0)
    pid = purchase(client, supplier, (a, 10, "1.00"), (b, 5, "3.00")).json()["id"]

    sent = client.post(f"/purchases/{pid}/send").json()
    assert (sent["status"], sent["ordered_at"] is not None) == ("ORDERED", True)
    assert stock(db, a) == 2  # enviar ainda não muda o estoque

    received = client.post(f"/purchases/{pid}/receive").json()
    assert (received["status"], received["received_at"] is not None) == ("RECEIVED", True)
    assert (stock(db, a), stock(db, b)) == (12, 5)

    movements = db.scalars(select(StockMovement).where(StockMovement.purchase_order_id == pid)).all()
    assert {(m.product_id, m.quantity, m.reason, m.balance_after) for m in movements} == {
        (a.id, 10, MovementReason.PURCHASE, 12),
        (b.id, 5, MovementReason.PURCHASE, 5),
    }
    # O histórico geral mostra de qual compra veio a entrada
    listed = client.get("/movements", params={"product_id": a.id}).json()["items"][0]
    assert (listed["purchase_order_id"], listed["note"]) == (pid, f"Compra #{pid} · {supplier.name}")


def test_receber_duas_vezes_nao_duplica_o_estoque(client, db, supplier):
    p = create_product(db)
    pid = purchase(client, supplier, (p, 7, "1.00")).json()["id"]
    client.post(f"/purchases/{pid}/send")
    client.post(f"/purchases/{pid}/receive")

    r = client.post(f"/purchases/{pid}/receive")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_PURCHASE_STATUS")
    assert stock(db, p) == 7


def test_nao_recebe_rascunho_nem_edita_enviado(client, db, supplier):
    p = create_product(db)
    pid = purchase(client, supplier, (p, 1, "1.00")).json()["id"]
    assert client.post(f"/purchases/{pid}/receive").status_code == 409

    client.post(f"/purchases/{pid}/send")
    r = client.patch(f"/purchases/{pid}", json={"note": "mudou"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "PURCHASE_NOT_DRAFT")


def test_cancela_enviado_mas_nao_recebido(client, db, supplier):
    p = create_product(db)
    sent = purchase(client, supplier, (p, 1, "1.00")).json()["id"]
    client.post(f"/purchases/{sent}/send")
    assert client.post(f"/purchases/{sent}/cancel").json()["status"] == "CANCELLED"
    assert client.post(f"/purchases/{sent}/receive").status_code == 409

    done = purchase(client, supplier, (p, 1, "1.00")).json()["id"]
    client.post(f"/purchases/{done}/send")
    client.post(f"/purchases/{done}/receive")
    assert client.post(f"/purchases/{done}/cancel").status_code == 409
    assert stock(db, p) == 1


def test_filtros_da_lista(client, db, supplier):
    p = create_product(db)
    other = create_supplier(db, name="Outra")
    first = purchase(client, supplier, (p, 1, "1.00")).json()["id"]
    purchase(client, other, (p, 1, "1.00"))
    client.post(f"/purchases/{first}/send")

    assert [x["id"] for x in client.get("/purchases", params={"status": "ORDERED"}).json()["items"]] == [first]
    assert client.get("/purchases", params={"supplier_id": other.id}).json()["total"] == 1


def test_compra_exige_login_e_leitor_so_consulta(anon_client, reader_client):
    assert anon_client.get("/purchases").status_code == 401
    assert reader_client.get("/purchases").status_code == 200
    assert reader_client.post("/purchases/1/receive").status_code == 403


# ---- Sugestão de reposição ----------------------------------------------------------


def test_sugestao_desconta_o_que_ja_esta_a_caminho(client, db, supplier):
    low = create_product(db, stock_quantity=2, min_stock=10, sku="LOW-1")
    covered = create_product(db, stock_quantity=1, min_stock=5, sku="LOW-2")
    create_product(db, stock_quantity=50, min_stock=5, sku="OK-1")

    pid = purchase(client, supplier, (covered, 20, "1.00")).json()["id"]
    client.post(f"/purchases/{pid}/send")
    # Um rascunho não conta como "a caminho"
    purchase(client, supplier, (low, 5, "1.00"))

    suggestions = client.get("/purchases/suggestions").json()
    assert [(s["sku"], s["suggested_quantity"]) for s in suggestions] == [("LOW-1", 18)]


# ---- Concorrência -------------------------------------------------------------------


def test_recebimentos_simultaneos_dao_entrada_uma_vez_so(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as s:
        cat = Category(name="Compras concorrentes")
        product = Product(sku="RACE-PO", name="P", unit_price=Decimal("1"), stock_quantity=0, category=cat)
        supplier = Supplier(name="Fornecedor concorrente")
        po = PurchaseOrder(
            supplier=supplier,
            status=PurchaseStatus.ORDERED,
            total_cost=Decimal("4"),
            items=[PurchaseOrderItem(product=product, quantity=4, unit_cost=Decimal("1"))],
        )
        s.add(po)
        s.commit()
        po_id, product_id = po.id, product.id

    barrier = Barrier(5)

    def receive():
        with factory() as s:
            barrier.wait()
            try:
                purchases.receive_purchase(s, po_id)
                return "ok"
            except ConflictError:
                return "conflict"

    try:
        with ThreadPoolExecutor(5) as pool:
            results = list(pool.map(lambda _: receive(), range(5)))
        with factory() as s:
            assert sorted(results) == ["conflict"] * 4 + ["ok"]
            assert s.get(Product, product_id).stock_quantity == 4
            count = select(func.count()).select_from(StockMovement).where(StockMovement.purchase_order_id == po_id)
            assert s.scalar(count) == 1
    finally:
        with factory() as s:
            s.execute(delete(StockMovement).where(StockMovement.product_id == product_id))
            s.execute(delete(PurchaseOrder).where(PurchaseOrder.id == po_id))
            s.execute(delete(Product).where(Product.id == product_id))
            s.execute(delete(Supplier).where(Supplier.name == "Fornecedor concorrente"))
            s.execute(delete(Category).where(Category.name == "Compras concorrentes"))
            s.commit()
