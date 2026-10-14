import pytest
from fastapi import APIRouter

from app.main import app
from tests.conftest import create_category, create_product


@pytest.mark.parametrize("path", ["/products", "/categories", "/customers", "/orders", "/reports/low-stock", "/health"])
def test_reads_are_public(anon_client, path):
    assert anon_client.get(path).status_code == 200


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("post", "/categories", {"name": "X"}),
        ("post", "/customers", {"name": "X", "email": "x@exemplo.com"}),
        ("post", "/orders", {"customer_id": 1, "items": [{"product_id": 1, "quantity": 1}]}),
        ("post", "/orders/1/cancel", None),
    ],
)
def test_writes_need_api_key(anon_client, method, path, body):
    r = getattr(anon_client, method)(path, json=body)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_API_KEY"
    assert r.headers["WWW-Authenticate"] == "ApiKey"


def test_wrong_key_rejected_and_nothing_changes(anon_client, db):
    p = create_product(db, stock_quantity=3)
    headers = {"X-API-Key": "chave-errada"}
    body = {"movement_type": "OUT", "quantity": 3, "reason": "ADJUSTMENT"}
    assert anon_client.post(f"/products/{p.id}/movements", json=body, headers=headers).status_code == 401
    assert anon_client.patch(f"/products/{p.id}", json={"name": "hack"}, headers=headers).status_code == 401
    db.refresh(p)
    assert p.stock_quantity == 3
    assert p.name != "hack"


def test_valid_key_allows_write(client, db):
    cat = create_category(db)
    assert client.patch(f"/categories/{cat.id}", json={"description": "ok"}).status_code == 200


def test_unexpected_error_returns_generic_500(anon_client):
    router = APIRouter()

    @router.get("/_boom")
    def boom():
        raise RuntimeError("senha=segredo no detalhe interno")

    app.include_router(router)
    try:
        r = anon_client.get("/_boom")
    finally:
        app.router.routes = [rt for rt in app.router.routes if getattr(rt, "path", None) != "/_boom"]
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Erro interno no servidor. Tente de novo mais tarde."}}
    assert "segredo" not in r.text


def test_openapi_documents_api_key(anon_client):
    schema = anon_client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["APIKeyHeader"]["name"] == "X-API-Key"
    assert "401" in schema["paths"]["/orders"]["post"]["responses"]


def test_verify_api_key(anon_client, client):
    assert client.post("/auth/verify").status_code == 204
    assert anon_client.post("/auth/verify").status_code == 401
    assert anon_client.post("/auth/verify", headers={"X-API-Key": "errada"}).status_code == 401
