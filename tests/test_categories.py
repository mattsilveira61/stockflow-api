from tests.conftest import create_category


def test_create_and_get(client):
    r = client.post("/categories", json={"name": "  Bebidas  ", "description": "Sucos"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Bebidas"
    assert body["is_active"] is True

    r = client.get(f"/categories/{body['id']}")
    assert r.status_code == 200
    assert r.json()["description"] == "Sucos"


def test_duplicate_name_case_insensitive(client, db):
    create_category(db, name="Bebidas")
    r = client.post("/categories", json={"name": "bebidas"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"


def test_empty_name_rejected(client):
    r = client.post("/categories", json={"name": "   "})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert r.json()["error"]["details"][0]["field"] == "name"


def test_not_found(client):
    r = client.get("/categories/999999")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "CATEGORY_NOT_FOUND", "message": "Categoria não encontrada"}}


def test_update_and_deactivate(client, db):
    cat = create_category(db, name="Limpeza")
    r = client.patch(f"/categories/{cat.id}", json={"name": "Higiene", "is_active": False})
    assert r.status_code == 200
    assert r.json()["name"] == "Higiene"
    assert r.json()["is_active"] is False


def test_rename_to_existing_name(client, db):
    create_category(db, name="A")
    b = create_category(db, name="B")
    assert client.patch(f"/categories/{b.id}", json={"name": "a"}).status_code == 409
    # Renomear para o próprio nome não é conflito
    assert client.patch(f"/categories/{b.id}", json={"name": "B"}).status_code == 200


def test_list_filter_and_pagination(client, db):
    for name in ["Cat C", "Cat A", "Cat B"]:
        create_category(db, name=name)
    create_category(db, name="Cat Z", is_active=False)

    r = client.get("/categories", params={"is_active": True, "page_size": 2})
    body = r.json()
    assert body["total"] == 3
    assert body["pages"] == 2
    assert [c["name"] for c in body["items"]] == ["Cat A", "Cat B"]

    r = client.get("/categories", params={"is_active": True, "page_size": 2, "page": 2})
    assert [c["name"] for c in r.json()["items"]] == ["Cat C"]


def test_page_size_limit(client):
    assert client.get("/categories", params={"page_size": 101}).status_code == 422
    assert client.get("/categories", params={"page": 0}).status_code == 422
