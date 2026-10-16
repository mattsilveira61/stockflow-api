import csv
import io
from decimal import Decimal

import pytest

from app.models import MovementReason, MovementType, Product
from app.services.inventory import lock_products, move_stock
from tests.conftest import create_category, create_product

HEADER = "sku;nome;categoria;preco;estoque_minimo;ativo;descricao\n"


def read_csv(response) -> list[dict]:
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")  # BOM: o Excel reconhece o UTF-8
    return list(csv.DictReader(io.StringIO(text[1:]), delimiter=";"))


def upload(client, text: str, *, dry_run: bool = False, encoding: str = "utf-8"):
    files = {"file": ("produtos.csv", text.encode(encoding), "text/csv")}
    return client.post("/products/import", files=files, params={"dry_run": dry_run})


@pytest.fixture
def mercearia(db):
    return create_category(db, name="Mercearia")


# ---- Exportação ---------------------------------------------------------------------


def test_exporta_produtos_com_filtros_e_formato_do_excel(client, db, mercearia):
    create_product(db, mercearia, sku="ARZ-1", name="Arroz", unit_price=Decimal("1234.50"), min_stock=3, description="5 kg")
    create_product(db, mercearia, sku="OLD-1", name="Antigo", is_active=False)

    response = client.get("/products/export.csv", params={"is_active": True})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="produtos.csv"' in response.headers["content-disposition"]
    rows = read_csv(response)
    assert rows == [
        {
            "sku": "ARZ-1",
            "nome": "Arroz",
            "categoria": "Mercearia",
            "preco": "1234,50",
            "estoque": "0",
            "estoque_minimo": "3",
            "ativo": "sim",
            "descricao": "5 kg",
        }
    ]


def test_exportacao_neutraliza_formulas_do_excel(client, db, mercearia):
    create_product(db, mercearia, sku="F-1", name="=HYPERLINK(\"http://x\")")
    rows = read_csv(client.get("/products/export.csv"))
    assert rows[0]["nome"] == "'=HYPERLINK(\"http://x\")"


def test_exporta_movimentacoes_no_fuso_da_loja(client, db, mercearia):
    p = create_product(db, mercearia, sku="MOV-1", name="Café")
    product = lock_products(db, [p.id])[p.id]
    move_stock(db, product, MovementType.IN, 10, MovementReason.PURCHASE, note="Nota 123")
    db.commit()

    rows = read_csv(client.get("/movements/export.csv", params={"product_id": p.id}))

    assert len(rows) == 1
    row = rows[0]
    assert (row["sku"], row["tipo"], row["motivo"], row["quantidade"], row["saldo_apos"]) == (
        "MOV-1", "Entrada", "Compra", "10", "10",
    )  # fmt: skip
    assert row["observacao"] == "Nota 123"
    assert len(row["data"]) == 16 and row["data"][2] == "/"  # dd/mm/aaaa hh:mm


def test_exportar_e_livre_sem_chave(anon_client):
    assert anon_client.get("/products/export.csv").status_code == 200


# ---- Importação ---------------------------------------------------------------------


def test_importa_cria_e_atualiza_pelo_sku(client, db, mercearia):
    existing = create_product(db, mercearia, sku="ARZ-1", name="Arroz", unit_price=Decimal("10"), stock_quantity=7)
    text = HEADER + "arz-1;Arroz tipo 1;mercearia;12,90;5;sim;\nFJ-1;Feijão;Mercearia;8.49;;;Carioca\n"

    response = upload(client, text)

    assert response.status_code == 200
    assert response.json() == {"created": 1, "updated": 1, "unchanged": 0, "dry_run": False}
    db.refresh(existing)
    assert (existing.name, existing.unit_price, existing.min_stock) == ("Arroz tipo 1", Decimal("12.90"), 5)
    assert existing.stock_quantity == 7  # saldo nunca muda pela importação
    new = db.query(Product).filter_by(sku="FJ-1").one()
    assert (new.name, new.unit_price, new.stock_quantity, new.description) == ("Feijão", Decimal("8.49"), 0, "Carioca")


def test_reimportar_o_mesmo_arquivo_nao_muda_nada(client, db, mercearia):
    text = HEADER + "ARZ-1;Arroz;Mercearia;12,90;5;sim;\n"
    upload(client, text)
    assert upload(client, text).json() == {"created": 0, "updated": 0, "unchanged": 1, "dry_run": False}


def test_simulacao_nao_grava(client, db, mercearia):
    response = upload(client, HEADER + "NEW-1;Novo;Mercearia;1,00;;;\n", dry_run=True)
    assert response.json() == {"created": 1, "updated": 0, "unchanged": 0, "dry_run": True}
    assert db.query(Product).filter_by(sku="NEW-1").count() == 0


def test_uma_linha_ruim_cancela_tudo_e_lista_os_erros(client, db, mercearia):
    text = (
        HEADER
        + "OK-1;Bom;Mercearia;1,00;;;\n"
        + ";Sem SKU;Mercearia;1,00;;;\n"
        + "BAD-2;;Inexistente;abc;-1;talvez;\n"
        + "OK-1;Repetido;Mercearia;1,00;;;\n"
    )

    response = upload(client, text)

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "IMPORT_INVALID"
    found = {(e["line"], e["field"]) for e in body["details"]}
    assert found == {
        (3, "sku"),
        (4, "nome"), (4, "categoria"), (4, "preco"), (4, "estoque_minimo"), (4, "ativo"),
        (5, "sku"),
    }  # fmt: skip
    assert db.query(Product).filter_by(sku="OK-1").count() == 0


def test_aceita_virgula_como_separador_e_arquivo_do_excel_em_windows_1252(client, db, mercearia):
    text = "sku,nome,categoria,preco\nACE-1,Açúcar,Mercearia,4.99\n"
    response = upload(client, text, encoding="cp1252")
    assert response.json()["created"] == 1
    assert db.query(Product).filter_by(sku="ACE-1").one().name == "Açúcar"


def test_exportacao_pode_ser_reimportada_sem_mudancas(client, db, mercearia):
    create_product(db, mercearia, sku="RT-1", name="Ida e volta", unit_price=Decimal("3.30"), min_stock=2)
    exported = client.get("/products/export.csv").content.decode("utf-8")
    assert upload(client, exported).json()["unchanged"] == 1


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("", "Arquivo vazio"),
        ("sku;nome\nA;B\n", "Faltam colunas obrigatórias: categoria, preco"),
    ],
)
def test_arquivo_invalido(client, text, message):
    response = upload(client, text)
    assert (response.status_code, response.json()["error"]["message"]) == (422, message)


def test_arquivo_grande_demais(client):
    assert upload(client, HEADER + "x" * 1_000_001).json()["error"]["message"] == "Arquivo maior que 1 MB"


def test_importar_exige_chave(anon_client):
    files = {"file": ("p.csv", HEADER.encode(), "text/csv")}
    assert anon_client.post("/products/import", files=files).status_code == 401
