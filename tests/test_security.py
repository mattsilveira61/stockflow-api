"""Login, perfis e o que cada um pode fazer (a matriz está em app/api/deps.py)."""

import pytest
from fastapi import APIRouter

from app.core import security
from app.main import app
from app.models import Role
from tests.conftest import PASSWORD, auth_header, create_category, create_product, create_user


def login(client, email, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---- Login --------------------------------------------------------------------------


def test_login_devolve_token_e_usuario(anon_client, db):
    user = create_user(db, Role.OPERADOR, email="op@teste.dev")
    r = login(anon_client, "OP@teste.dev")  # e-mail sem diferenciar maiúsculas
    assert r.status_code == 200
    body = r.json()
    assert (body["token_type"], body["user"]["id"], body["user"]["role"]) == ("bearer", user.id, "OPERADOR")
    assert "password_hash" not in body["user"]

    me = anon_client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "op@teste.dev"


@pytest.mark.parametrize("email, password", [("op@teste.dev", "errada"), ("ninguem@teste.dev", PASSWORD)])
def test_login_errado_nao_diz_o_que_errou(anon_client, db, email, password):
    create_user(db, Role.OPERADOR, email="op@teste.dev")
    r = login(anon_client, email, password)
    assert (r.status_code, r.json()["error"]["code"]) == (401, "INVALID_CREDENTIALS")


def test_usuario_desativado_nao_entra_e_perde_o_token(anon_client, db):
    user = create_user(db, Role.ADMIN, email="saiu@teste.dev")
    headers = auth_header(user)
    user.is_active = False
    db.commit()
    assert login(anon_client, "saiu@teste.dev").json()["error"]["code"] == "USER_INACTIVE"
    assert anon_client.get("/products", headers=headers).status_code == 401


def test_quinto_erro_bloqueia_o_login(anon_client, db):
    create_user(db, Role.LEITOR, email="lia@teste.dev")
    for _ in range(5):
        assert login(anon_client, "lia@teste.dev", "errada").status_code == 401
    r = login(anon_client, "lia@teste.dev")
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_token_vencido_ou_adulterado(anon_client, db, monkeypatch):
    user = create_user(db, Role.ADMIN)
    monkeypatch.setattr(security.get_settings(), "access_token_expire_minutes", -1)
    expired = security.create_access_token(user.id)
    for token in (expired, "nao-e-um-token", security.create_access_token(user.id) + "x"):
        r = anon_client.get("/products", headers={"Authorization": f"Bearer {token}"})
        assert (r.status_code, r.json()["error"]["code"]) == (401, "INVALID_TOKEN")


# ---- Perfis -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/products", "/categories", "/customers", "/orders", "/movements", "/dashboard", "/purchases"]
)
def test_consultas_exigem_login(anon_client, reader_client, path):
    r = anon_client.get(path)
    assert (r.status_code, r.json()["error"]["code"], r.headers["WWW-Authenticate"]) == (
        401, "NOT_AUTHENTICATED", "Bearer",
    )  # fmt: skip
    assert reader_client.get(path).status_code == 200


def test_health_continua_publico(anon_client):
    assert anon_client.get("/health").status_code == 200


def test_leitor_nao_altera_nada(reader_client, db):
    p = create_product(db, stock_quantity=3)
    body = {"movement_type": "OUT", "quantity": 3, "reason": "ADJUSTMENT"}
    assert reader_client.post(f"/products/{p.id}/movements", json=body).status_code == 403
    assert reader_client.post("/customers", json={"name": "X", "email": "x@exemplo.com"}).status_code == 403
    r = reader_client.post("/orders", json={"customer_id": 1, "items": [{"product_id": p.id, "quantity": 1}]})
    assert (r.status_code, r.json()["error"]["code"]) == (403, "FORBIDDEN")
    db.refresh(p)
    assert p.stock_quantity == 3


def test_operador_opera_mas_nao_mexe_no_catalogo(operator_client, db):
    p = create_product(db, stock_quantity=0)
    body = {"movement_type": "IN", "quantity": 5, "reason": "PURCHASE"}
    assert operator_client.post(f"/products/{p.id}/movements", json=body).status_code == 201
    assert operator_client.post("/customers", json={"name": "X", "email": "x@exemplo.com"}).status_code == 201

    assert operator_client.patch(f"/products/{p.id}", json={"name": "Outro"}).status_code == 403
    assert operator_client.post("/categories", json={"name": "Nova"}).status_code == 403
    assert operator_client.get("/users").status_code == 403


def test_admin_altera_o_catalogo(client, db):
    cat = create_category(db)
    assert client.patch(f"/categories/{cat.id}", json={"description": "ok"}).status_code == 200


# ---- Usuários -----------------------------------------------------------------------


def test_admin_cria_lista_e_desativa_usuario(client, anon_client):
    r = client.post("/users", json={"name": "Novo", "email": "Novo@Teste.dev", "password": "12345678", "role": "LEITOR"})
    assert r.status_code == 201
    new = r.json()
    assert (new["email"], "password" not in new) == ("novo@teste.dev", True)
    assert login(anon_client, "novo@teste.dev", "12345678").status_code == 200

    assert client.patch(f"/users/{new['id']}", json={"is_active": False}).json()["is_active"] is False
    assert any(u["id"] == new["id"] for u in client.get("/users").json())


def test_email_de_usuario_unico(client, db):
    create_user(db, Role.LEITOR, email="dup@teste.dev")
    r = client.post("/users", json={"name": "Dup", "email": "dup@teste.dev", "password": "12345678", "role": "LEITOR"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_TAKEN")


def test_admin_nao_se_tranca_para_fora(client, admin):
    assert client.patch(f"/users/{admin.id}", json={"is_active": False}).status_code == 409
    assert client.patch(f"/users/{admin.id}", json={"role": "LEITOR"}).status_code == 409


@pytest.mark.parametrize("password", ["curta", "á" * 37])
def test_senha_invalida(client, password):
    r = client.post("/users", json={"name": "X", "email": "x@teste.dev", "password": password, "role": "LEITOR"})
    assert r.status_code == 422


# ---- Erros --------------------------------------------------------------------------


def test_openapi_documenta_o_login_por_token(anon_client):
    schema = anon_client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert "403" in schema["paths"]["/orders"]["post"]["responses"]


def test_erro_inesperado_vira_500_generico(anon_client):
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
