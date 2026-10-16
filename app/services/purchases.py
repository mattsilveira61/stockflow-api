"""Fornecedores e pedidos de compra.

Fluxo: DRAFT (rascunho editável) -> ORDERED (enviado) -> RECEIVED (estoque entrou).
DRAFT e ORDERED podem ir para CANCELLED. Cada mudança de status é um UPDATE condicional
(`WHERE status = <esperado>`): duas requisições simultâneas não recebem o mesmo pedido duas vezes.
"""

from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import ConflictError, NotFoundError
from app.models import MovementReason, MovementType, Product, PurchaseOrder, PurchaseOrderItem, PurchaseStatus, Supplier
from app.schemas.common import paginate, text_search
from app.schemas.purchase import (
    PurchaseCreate,
    PurchaseFilters,
    PurchaseItemIn,
    PurchaseUpdate,
    RestockSuggestion,
    SupplierCreate,
    SupplierFilters,
    SupplierUpdate,
)
from app.services.inventory import lock_products, move_stock

CENTS = Decimal("0.01")

# ---- Fornecedores ---------------------------------------------------------------------


def get_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise NotFoundError("Fornecedor não encontrado", "SUPPLIER_NOT_FOUND")
    return supplier


def _ensure_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Supplier.id).where(func.lower(Supplier.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Supplier.id != exclude_id)
    if db.scalar(stmt):
        raise ConflictError("Já existe um fornecedor com esse nome", "SUPPLIER_NAME_TAKEN")


def list_suppliers(db: Session, f: SupplierFilters) -> dict:
    stmt = select(Supplier).order_by(Supplier.name.collate("und-x-icu"), Supplier.id)
    if f.q and f.q.strip():
        stmt = stmt.where(text_search(f.q, Supplier.name, Supplier.email))
    if f.active is not None:
        stmt = stmt.where(Supplier.is_active.is_(f.active))
    return paginate(db, stmt, f)


def create_supplier(db: Session, data: SupplierCreate) -> Supplier:
    _ensure_name_free(db, data.name)
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    db.commit()
    return supplier


def update_supplier(db: Session, supplier_id: int, data: SupplierUpdate) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    changes = data.model_dump(exclude_unset=True)
    # name e is_active não aceitam null; e-mail e telefone em null apagam o valor
    for field in ("name", "is_active"):
        if changes.get(field, ...) is None:
            changes.pop(field)
    if "name" in changes:
        _ensure_name_free(db, changes["name"], exclude_id=supplier_id)
    for field, value in changes.items():
        setattr(supplier, field, value)
    db.commit()
    return supplier


# ---- Pedidos de compra ----------------------------------------------------------------


def get_purchase(db: Session, purchase_id: int) -> PurchaseOrder:
    stmt = (
        select(PurchaseOrder)
        .where(PurchaseOrder.id == purchase_id)
        .options(
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product), joinedload(PurchaseOrder.supplier)
        )
        .execution_options(populate_existing=True)
    )
    purchase = db.scalar(stmt)
    if purchase is None:
        raise NotFoundError("Pedido de compra não encontrado", "PURCHASE_NOT_FOUND")
    return purchase


def list_purchases(db: Session, f: PurchaseFilters) -> dict:
    stmt = (
        select(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier))
        .order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc())
    )
    if f.supplier_id is not None:
        stmt = stmt.where(PurchaseOrder.supplier_id == f.supplier_id)
    if f.status is not None:
        stmt = stmt.where(PurchaseOrder.status == f.status)
    return paginate(db, stmt, f)


def _active_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    if not supplier.is_active:
        raise ConflictError("O fornecedor está desativado", "SUPPLIER_INACTIVE")
    return supplier


def _build_items(db: Session, items: list[PurchaseItemIn]) -> tuple[list[PurchaseOrderItem], Decimal]:
    ids = [i.product_id for i in items]
    if len(ids) != len(set(ids)):
        raise ConflictError("O mesmo produto aparece mais de uma vez; junte as quantidades", "DUPLICATE_ITEM")
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(ids)))}
    missing = sorted(set(ids) - set(products))
    if missing:
        raise NotFoundError(f"Produto(s) não encontrado(s): {missing}", "PRODUCT_NOT_FOUND")
    inactive = sorted(p.sku for p in products.values() if not p.is_active)
    if inactive:
        raise ConflictError(f"Produto(s) desativado(s): {', '.join(inactive)}", "PRODUCT_INACTIVE")

    rows = [
        PurchaseOrderItem(product=products[i.product_id], quantity=i.quantity, unit_cost=i.unit_cost)
        for i in sorted(items, key=lambda i: i.product_id)
    ]
    total = sum((r.unit_cost * r.quantity for r in rows), Decimal("0"))
    return rows, total.quantize(CENTS)


def create_purchase(db: Session, data: PurchaseCreate) -> PurchaseOrder:
    supplier = _active_supplier(db, data.supplier_id)
    items, total = _build_items(db, data.items)
    purchase = PurchaseOrder(
        supplier=supplier, status=PurchaseStatus.DRAFT, total_cost=total, note=data.note, items=items
    )
    db.add(purchase)
    db.commit()
    return get_purchase(db, purchase.id)


def update_purchase(db: Session, purchase_id: int, data: PurchaseUpdate) -> PurchaseOrder:
    purchase = get_purchase(db, purchase_id)
    if purchase.status != PurchaseStatus.DRAFT:
        raise ConflictError("Só o rascunho pode ser alterado", "PURCHASE_NOT_DRAFT")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("supplier_id") is not None:
        purchase.supplier = _active_supplier(db, data.supplier_id)
    if data.items is not None:
        purchase.items.clear()
        db.flush()  # apaga os itens antigos antes de inserir (UNIQUE pedido + produto)
        purchase.items, purchase.total_cost = _build_items(db, data.items)
    if "note" in changes:
        purchase.note = data.note or None
    db.commit()
    return get_purchase(db, purchase_id)


def _transition(
    db: Session, purchase_id: int, allowed: tuple[PurchaseStatus, ...], new: PurchaseStatus, **values
) -> None:
    """UPDATE condicional: só muda se o status atual for um dos permitidos. Não faz commit."""
    changed = db.execute(
        update(PurchaseOrder)
        .where(PurchaseOrder.id == purchase_id, PurchaseOrder.status.in_(allowed))
        .values(status=new, updated_at=func.now(), **values)
        .returning(PurchaseOrder.id)
    ).scalar()
    if changed is None:
        current = db.scalar(select(PurchaseOrder.status).where(PurchaseOrder.id == purchase_id))
        raise ConflictError(f"Não é possível passar de {current} para {new}", "INVALID_PURCHASE_STATUS")


def send_purchase(db: Session, purchase_id: int) -> PurchaseOrder:
    get_purchase(db, purchase_id)  # 404
    try:
        _transition(db, purchase_id, (PurchaseStatus.DRAFT,), PurchaseStatus.ORDERED, ordered_at=func.now())
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_purchase(db, purchase_id)


def receive_purchase(db: Session, purchase_id: int) -> PurchaseOrder:
    """Dá entrada de todos os itens numa transação só: status, saldos e movimentações mudam juntos."""
    purchase = get_purchase(db, purchase_id)
    try:
        # Primeiro o UPDATE condicional: um segundo recebimento simultâneo espera, vê RECEIVED e para aqui.
        _transition(db, purchase_id, (PurchaseStatus.ORDERED,), PurchaseStatus.RECEIVED, received_at=func.now())
        products = lock_products(db, (i.product_id for i in purchase.items))
        for item in purchase.items:  # já em ordem de produto
            move_stock(
                db,
                products[item.product_id],
                MovementType.IN,
                item.quantity,
                MovementReason.PURCHASE,
                purchase_order=purchase,
                note=f"Compra #{purchase.id} · {purchase.supplier.name}",
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_purchase(db, purchase_id)


def cancel_purchase(db: Session, purchase_id: int) -> PurchaseOrder:
    """Rascunho ou enviado. Recebido não cancela: o estoque já entrou (use um ajuste de saída)."""
    get_purchase(db, purchase_id)
    try:
        _transition(db, purchase_id, (PurchaseStatus.DRAFT, PurchaseStatus.ORDERED), PurchaseStatus.CANCELLED)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_purchase(db, purchase_id)


def restock_suggestions(db: Session) -> list[RestockSuggestion]:
    """Produtos ativos no mínimo ou abaixo, descontando o que já está a caminho (compras ORDERED).

    Sugere comprar até o dobro do mínimo: uma regra simples e fácil de explicar.
    """
    incoming = (
        select(PurchaseOrderItem.product_id, func.sum(PurchaseOrderItem.quantity).label("qty"))
        .join(PurchaseOrder)
        .where(PurchaseOrder.status == PurchaseStatus.ORDERED)
        .group_by(PurchaseOrderItem.product_id)
        .subquery()
    )
    on_hand = Product.stock_quantity + func.coalesce(incoming.c.qty, 0)
    stmt = (
        select(Product, on_hand)
        .outerjoin(incoming, incoming.c.product_id == Product.id)
        .where(
            Product.is_active.is_(True),
            Product.stock_quantity <= Product.min_stock,
            on_hand < Product.min_stock * 2,
        )
        .order_by((Product.stock_quantity - Product.min_stock).asc(), Product.id)
    )
    return [
        RestockSuggestion(
            product_id=p.id,
            sku=p.sku,
            name=p.name,
            stock_quantity=p.stock_quantity,
            min_stock=p.min_stock,
            suggested_quantity=max(p.min_stock * 2 - expected, 1),
        )
        for p, expected in db.execute(stmt)
    ]
