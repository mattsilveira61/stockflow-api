from tests.conftest import create_customer


def test_create_and_get(client):
    r = client.post("/customers", json={"name": " Ana Souza ", "email": "Ana.Souza@Exemplo.com"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Ana Souza"
    assert body["email"] == "ana.souza@exemplo.com"
    assert client.get(f"/customers/{body['id']}").json()["email"] == "ana.souza@exemplo.com"


def test_duplicate_email_ignores_case(client, db):
    create_customer(db, email="ana@exemplo.com")
    r = client.post("/customers", json={"name": "Outra", "email": "ANA@exemplo.com"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "EMAIL_TAKEN"


def test_invalid_email(client):
    r = client.post("/customers", json={"name": "Ana", "email": "nao-e-email"})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["field"] == "email"


def test_not_found(client):
    assert client.get("/customers/999999").status_code == 404
    assert client.patch("/customers/999999", json={"name": "x"}).status_code == 404


def test_update(client, db):
    c = create_customer(db)
    other = create_customer(db, email="usado@exemplo.com")
    assert client.patch(f"/customers/{c.id}", json={"email": "usado@exemplo.com"}).status_code == 409
    r = client.patch(f"/customers/{c.id}", json={"name": "Novo Nome", "email": "novo@exemplo.com"})
    assert r.status_code == 200
    assert r.json()["name"] == "Novo Nome"
    assert r.json()["email"] == "novo@exemplo.com"
    assert other.email == "usado@exemplo.com"


def test_list_search(client, db):
    create_customer(db, name="Bruno Lima", email="bruno@exemplo.com")
    create_customer(db, name="Ana Souza", email="ana@exemplo.com")
    create_customer(db, name="Carla", email="carla@outro.com")
    names = [c["name"] for c in client.get("/customers").json()["items"]]
    assert names == ["Ana Souza", "Bruno Lima", "Carla"]
    names = [c["name"] for c in client.get("/customers", params={"q": "exemplo"}).json()["items"]]
    assert names == ["Ana Souza", "Bruno Lima"]
