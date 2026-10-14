from decimal import Decimal

import pytest

from tests.conftest import create_category, create_product


@pytest.fixture
def category(db):
    return create_category(db, name="Mercearia")


def payload(category, **kw):
    return {"sku": "mer-010", "name": "Arroz 5 kg", "unit_price": "27.90", "category_id": category.id} | kw


def test_create_product(client, category):
    r = client.post("/products", json=payload(category, min_stock=5))
    assert r.status_code == 201
    body = r.json()
    assert body["sku"] == "MER-010"  # SKU normalizado em maiúsculas
    assert body["stock_quantity"] == 0
    assert body["min_stock"] == 5
    assert Decimal(body["unit_price"]) == Decimal("27.90")


def test_get_product(client, db):
    p = create_product(db)
    r = client.get(f"/products/{p.id}")
    assert r.status_code == 200
    assert r.json()["sku"] == p.sku


def test_duplicate_sku(client, db, category):
    create_product(db, sku="MER-010")
    r = client.post("/products", json=payload(category))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "SKU_TAKEN"


def test_stock_quantity_not_accepted_on_create(client, category):
    r = client.post("/products", json=payload(category, stock_quantity=50))
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["field"] == "stock_quantity"


def test_stock_quantity_not_accepted_on_update(client, db):
    p = create_product(db)
    r = client.patch(f"/products/{p.id}", json={"stock_quantity": 50})
    assert r.status_code == 422
    db.refresh(p)
    assert p.stock_quantity == 0


@pytest.mark.parametrize(
    "field, value",
    [("unit_price", "-1"), ("unit_price", "1.999"), ("unit_price", "abc"), ("min_stock", -1), ("name", ""), ("sku", " ")],
)
def test_invalid_fields(client, category, field, value):
    r = client.post("/products", json=payload(category, **{field: value}))
    assert r.status_code == 422


def test_missing_required_fields(client):
    r = client.post("/products", json={})
    assert r.status_code == 422
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert {"sku", "name", "unit_price", "category_id"} <= fields


def test_category_not_found(client):
    r = client.post("/products", json={"sku": "X", "name": "X", "unit_price": "1", "category_id": 999999})
    assert r.status_code == 404


def test_inactive_category_rejected(client, db):
    cat = create_category(db, is_active=False)
    r = client.post("/products", json=payload(cat))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CATEGORY_INACTIVE"


def test_product_not_found(client):
    assert client.get("/products/999999").status_code == 404
    assert client.patch("/products/999999", json={"name": "x"}).status_code == 404


def test_update_product(client, db):
    p = create_product(db, description="antiga")
    other = create_category(db)
    r = client.patch(
        f"/products/{p.id}",
        json={"name": "Novo nome", "unit_price": "12.50", "category_id": other.id, "description": None},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Novo nome"
    assert body["unit_price"] == "12.50"
    assert body["category_id"] == other.id
    assert body["description"] is None


def test_update_to_taken_sku(client, db):
    create_product(db, sku="A-1")
    p = create_product(db, sku="B-1")
    assert client.patch(f"/products/{p.id}", json={"sku": "a-1"}).status_code == 409
    assert client.patch(f"/products/{p.id}", json={"sku": "B-1"}).status_code == 200


def test_deactivate_product(client, db):
    p = create_product(db)
    r = client.patch(f"/products/{p.id}", json={"is_active": False})
    assert r.json()["is_active"] is False


def test_no_delete_endpoint(client, db):
    p = create_product(db)
    assert client.delete(f"/products/{p.id}").status_code == 405


class TestListing:
    @pytest.fixture
    def catalog(self, db):
        bebidas = create_category(db, name="Bebidas")
        mercearia = create_category(db, name="Mercearia")
        create_product(db, bebidas, sku="BEB-1", name="Suco de uva", unit_price=Decimal("8.00"))
        create_product(db, bebidas, sku="BEB-2", name="Água 100%", unit_price=Decimal("2.00"))
        create_product(db, mercearia, sku="MER-1", name="Arroz", unit_price=Decimal("25.00"))
        create_product(db, mercearia, sku="MER-2", name="Feijão", unit_price=Decimal("8.50"), is_active=False)
        return bebidas, mercearia

    def names(self, client, **params):
        return [p["name"] for p in client.get("/products", params=params).json()["items"]]

    def test_default_sort_by_name(self, client, catalog):
        assert self.names(client) == ["Água 100%", "Arroz", "Feijão", "Suco de uva"]

    def test_sort_desc_by_price(self, client, catalog):
        assert self.names(client, sort="-unit_price") == ["Arroz", "Feijão", "Suco de uva", "Água 100%"]

    def test_invalid_sort(self, client, catalog):
        assert client.get("/products", params={"sort": "password"}).status_code == 422

    def test_search_by_name_or_sku(self, client, catalog):
        assert self.names(client, q="suco") == ["Suco de uva"]
        assert self.names(client, q="mer-") == ["Arroz", "Feijão"]

    def test_search_escapes_wildcards(self, client, catalog):
        assert self.names(client, q="%") == ["Água 100%"]

    def test_filter_category_and_active(self, client, catalog):
        _, mercearia = catalog
        assert self.names(client, category_id=mercearia.id) == ["Arroz", "Feijão"]
        assert self.names(client, category_id=mercearia.id, is_active=True) == ["Arroz"]

    def test_pagination(self, client, catalog):
        body = client.get("/products", params={"page_size": 3, "page": 2}).json()
        assert body["total"] == 4
        assert body["pages"] == 2
        assert [p["name"] for p in body["items"]] == ["Suco de uva"]


def test_search_ignores_accents(client, db):
    create_product(db, sku="ACC-1", name="Feijão carioca")
    create_product(db, sku="ACC-2", name="Água mineral")
    names = lambda q: [p["name"] for p in client.get("/products", params={"q": q}).json()["items"]]  # noqa: E731
    assert names("feijao") == ["Feijão carioca"]
    assert names("AGUA") == ["Água mineral"]
    assert names("água") == ["Água mineral"]
