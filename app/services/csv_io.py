"""Exportação e importação de planilhas CSV.

Formato pensado para o Excel em português: separador `;`, vírgula decimal e BOM no início
(sem ele o Excel abre o UTF-8 com acentos quebrados). Na importação também vale `,` como
separador e ponto decimal, e o arquivo pode vir em UTF-8 ou no Windows-1252 que o Excel salva.
"""

import csv
import io
from collections.abc import Iterator
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core import clock
from app.core.errors import AppError
from app.models import Category, MovementType, Product
from app.schemas.product import ProductFilters
from app.schemas.stock_movement import MovementFilters
from app.services.catalog import products_query
from app.services.inventory import movements_query

SEPARATOR = ";"
MAX_IMPORT_BYTES = 1_000_000
MAX_IMPORT_ROWS = 1000

PRODUCT_COLUMNS = ["sku", "nome", "categoria", "preco", "estoque", "estoque_minimo", "ativo", "descricao"]
MOVEMENT_COLUMNS = [
    "data", "sku", "produto", "tipo", "motivo", "quantidade", "saldo_apos", "pedido", "compra", "observacao",
]  # fmt: skip

REASONS = {"PURCHASE": "Compra", "ADJUSTMENT": "Ajuste", "SALE": "Venda", "CANCELLATION": "Cancelamento"}


class CsvImportError(AppError):
    """Arquivo com problemas: nada foi gravado. `errors` lista cada linha recusada."""

    status_code = 422
    code = "IMPORT_INVALID"

    def __init__(self, message: str, errors: list[dict]):
        super().__init__(message)
        self.errors = errors


# ---- Exportação ---------------------------------------------------------------------


def _text(value: str | None) -> str:
    """Neutraliza fórmulas: no Excel, uma célula que começa com = + - @ seria executada."""
    if not value:
        return ""
    return f"'{value}" if value[0] in "=+-@\t\r" else value


def _money(value: Decimal) -> str:
    return f"{value:.2f}".replace(".", ",")


def _rows_to_csv(header: list[str], rows: Iterator[list]) -> Iterator[str]:
    """Gera o arquivo aos poucos (streaming), sem montar tudo na memória."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=SEPARATOR, lineterminator="\r\n")

    def flush() -> str:
        chunk = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate()
        return chunk

    writer.writerow(header)
    yield "﻿" + flush()
    for n, row in enumerate(rows, 1):
        writer.writerow(row)
        if n % 500 == 0:
            yield flush()
    yield flush()


def export_products(db: Session, f: ProductFilters) -> Iterator[str]:
    rows = (
        [
            _text(p.sku),
            _text(p.name),
            _text(p.category.name),
            _money(p.unit_price),
            p.stock_quantity,
            p.min_stock,
            "sim" if p.is_active else "não",
            _text(p.description),
        ]
        for p in db.scalars(products_query(f).options(joinedload(Product.category)).execution_options(yield_per=500))
    )
    return _rows_to_csv(PRODUCT_COLUMNS, rows)


def export_movements(db: Session, f: MovementFilters) -> Iterator[str]:
    tz = clock.company_tz()
    rows = (
        [
            m.created_at.astimezone(tz).strftime("%d/%m/%Y %H:%M"),
            _text(m.product.sku),
            _text(m.product.name),
            "Entrada" if m.movement_type == MovementType.IN else "Saída",
            REASONS[m.reason],
            m.quantity,
            m.balance_after,
            m.order_id or "",
            m.purchase_order_id or "",
            _text(m.note),
        ]
        for m in db.scalars(movements_query(f).execution_options(yield_per=500))
    )
    return _rows_to_csv(MOVEMENT_COLUMNS, rows)


# ---- Importação de produtos ---------------------------------------------------------


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    dry_run: bool = True
    errors: list[dict] = field(default_factory=list)


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def _parse_money(text: str) -> Decimal | None:
    """Aceita "12,90", "12.90" e "1.234,56"."""
    value = text.strip().replace("R$", "").replace(" ", "")
    if "," in value:
        value = value.replace(".", "").replace(",", ".")
    try:
        number = Decimal(value)
    except InvalidOperation:
        return None
    if number < 0 or number != number.quantize(Decimal("0.01")) or number >= Decimal("10000000000"):
        return None
    return number


def _parse_bool(text: str) -> bool | None:
    value = text.strip().lower()
    if value in {"sim", "s", "true", "1", "ativo", "yes"}:
        return True
    if value in {"não", "nao", "n", "false", "0", "inativo", "no"}:
        return False
    return None


def import_products(db: Session, raw: bytes, *, dry_run: bool) -> ImportResult:
    """Cria os SKUs novos e atualiza os existentes. Tudo ou nada: com um erro, nada é gravado.

    O saldo (coluna `estoque`) é ignorado de propósito: estoque só muda por movimentação.
    """
    if len(raw) > MAX_IMPORT_BYTES:
        raise CsvImportError("Arquivo maior que 1 MB", [])
    text = _decode(raw)
    if not text.strip():
        raise CsvImportError("Arquivo vazio", [])

    first_line = text.splitlines()[0]
    delimiter = ";" if ";" in first_line else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = {(h or "").strip().lower() for h in reader.fieldnames or []}
    missing = [c for c in ("sku", "nome", "categoria", "preco") if c not in headers]
    if missing:
        raise CsvImportError(f"Faltam colunas obrigatórias: {', '.join(missing)}", [])

    rows = []
    for row in reader:
        rows.append({(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if k})
        if len(rows) > MAX_IMPORT_ROWS:
            raise CsvImportError(f"Máximo de {MAX_IMPORT_ROWS} linhas por arquivo", [])

    # Categoria pelo nome, sem diferenciar maiúsculas
    categories = {c.name.lower(): c for c in db.scalars(select(Category).where(Category.is_active.is_(True)))}
    skus = [r.get("sku", "").upper() for r in rows]
    existing = {p.sku: p for p in db.scalars(select(Product).where(Product.sku.in_([s for s in skus if s])))}
    result = ImportResult(dry_run=dry_run)
    seen: set[str] = set()
    changes: list[tuple[Product | None, dict]] = []

    for line, (row, sku) in enumerate(zip(rows, skus, strict=True), start=2):  # linha 1 é o cabeçalho
        def error(column: str, message: str, line: int = line) -> None:
            result.errors.append({"line": line, "field": column, "message": message})

        if not any(row.values()):
            continue  # linha em branco no fim do arquivo
        if not sku:
            error("sku", "Informe o SKU")
        elif len(sku) > 50:
            error("sku", "SKU com mais de 50 caracteres")
        elif sku in seen:
            error("sku", f"SKU {sku} repetido no arquivo")
        seen.add(sku)

        name = row.get("nome", "")
        if not name:
            error("nome", "Informe o nome")
        elif len(name) > 200:
            error("nome", "Nome com mais de 200 caracteres")

        category = categories.get(row.get("categoria", "").lower())
        if category is None:
            error("categoria", f"Categoria \"{row.get('categoria', '')}\" não existe ou está desativada")

        price = _parse_money(row.get("preco", ""))
        if price is None:
            error("preco", "Preço inválido (use 12,90)")

        values: dict = {"name": name, "category_id": category.id if category else None, "unit_price": price}
        if row.get("estoque_minimo", ""):
            min_stock = row["estoque_minimo"]
            if not min_stock.isdigit():
                error("estoque_minimo", "Estoque mínimo deve ser um número inteiro maior ou igual a zero")
            else:
                values["min_stock"] = int(min_stock)
        if row.get("ativo", ""):
            active = _parse_bool(row["ativo"])
            if active is None:
                error("ativo", "Use sim ou não")
            else:
                values["is_active"] = active
        if "descricao" in row:
            values["description"] = row["descricao"] or None

        changes.append((existing.get(sku), {"sku": sku, **values}))

    if result.errors:
        raise CsvImportError(f"{len(result.errors)} problema(s) no arquivo. Nada foi gravado.", result.errors)

    for product, values in changes:
        if product is None:
            result.created += 1
            db.add(Product(**values))
            continue
        diff = {k: v for k, v in values.items() if getattr(product, k) != v}
        if not diff:
            result.unchanged += 1
            continue
        result.updated += 1
        for key, value in diff.items():
            setattr(product, key, value)

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return result
