from decimal import Decimal
from itertools import count

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import ROOT_DIR, get_settings
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.models import Category, Customer, Product, Role, User

_seq = count(1)


@pytest.fixture(scope="session")
def engine():
    """Recria o banco de teste do zero aplicando as migrações (testa também a migração)."""
    url = get_settings().test_database_url
    assert url, "Defina TEST_DATABASE_URL no .env"
    eng = create_engine(url)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(str(ROOT_DIR / "alembic.ini"))
    cfg.attributes["db_url"] = url
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    """Cada teste roda dentro de uma transação desfeita no final: os testes não se enxergam.
    Os commits feitos pelo código viram savepoints dentro dessa transação."""
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    trans.rollback()
    conn.close()


PASSWORD = "senha-de-teste-123"


def create_user(db: Session, role: Role, email: str | None = None, **kw) -> User:
    user = User(
        name=kw.pop("name", f"Usuário {role.value.title()}"),
        email=email or f"{role.value.lower()}{next(_seq)}@teste.dev",
        role=role,
        password_hash=hash_password(PASSWORD),
        **kw,
    )
    db.add(user)
    db.commit()
    return user


def auth_header(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def api(db):
    """Liga a API à sessão do teste; cada cliente abaixo só muda o cabeçalho de login."""
    app.dependency_overrides[get_db] = lambda: db
    login_limiter.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def admin(db) -> User:
    return create_user(db, Role.ADMIN)


@pytest.fixture
def client(api, admin):
    """Logado como ADMIN, que pode tudo: o cliente padrão dos testes de regra de negócio."""
    with TestClient(app, headers=auth_header(admin)) as c:
        yield c


@pytest.fixture
def operator_client(api, db):
    with TestClient(app, headers=auth_header(create_user(db, Role.OPERADOR))) as c:
        yield c


@pytest.fixture
def reader_client(api, db):
    with TestClient(app, headers=auth_header(create_user(db, Role.LEITOR))) as c:
        yield c


@pytest.fixture
def anon_client(api):
    """Sem login, para testar o que é protegido (e o 500 genérico, sem relançar a exceção)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---- Fábricas de dados -------------------------------------------------------------
# Fazem commit (que no teste vira savepoint): assim o rollback de um service que falhou
# desfaz só o que o service fez, e não os dados preparados pelo teste.


def create_category(db: Session, **kw) -> Category:
    cat = Category(name=kw.pop("name", f"Categoria {next(_seq)}"), **kw)
    db.add(cat)
    db.commit()
    return cat


def create_product(db: Session, category: Category | None = None, **kw) -> Product:
    n = next(_seq)
    prod = Product(
        sku=kw.pop("sku", f"SKU-{n:05d}"),
        name=kw.pop("name", f"Produto {n}"),
        unit_price=kw.pop("unit_price", Decimal("10.00")),
        category=category or create_category(db),
        **kw,
    )
    db.add(prod)
    db.commit()
    return prod


def create_customer(db: Session, **kw) -> Customer:
    n = next(_seq)
    cust = Customer(name=kw.pop("name", f"Cliente {n}"), email=kw.pop("email", f"cliente{n}@exemplo.com"), **kw)
    db.add(cust)
    db.commit()
    return cust
