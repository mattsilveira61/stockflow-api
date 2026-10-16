"""Única porta de entrada para alterar o saldo de um produto.

Toda mudança de `products.stock_quantity` passa por `move_stock`, que trava a linha do
produto, valida, atualiza o saldo e grava a movimentação na mesma transação. Quem chama
decide quando fazer o commit (um pedido junta várias movimentações em um commit só).
"""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core import clock
from app.core.errors import ConflictError
from app.models import MovementReason, MovementType, Order, Product, PurchaseOrder, StockMovement
from app.schemas.common import PageParams, paginate
from app.schemas.stock_movement import MovementCreate, MovementFilters
from app.services.catalog import get_product


def lock_products(db: Session, product_ids: Iterable[int]) -> dict[int, Product]:
    """SELECT ... FOR UPDATE em ordem de id.

    Duas transações que compram os mesmos produtos sempre pedem os locks na mesma ordem,
    então uma espera a outra em vez de travarem uma à outra (deadlock). `populate_existing`
    garante que o saldo lido é o do banco depois do lock, não um valor antigo da sessão.
    """
    ids = sorted(set(product_ids))
    stmt = select(Product).where(Product.id.in_(ids)).order_by(Product.id).with_for_update()
    return {p.id: p for p in db.scalars(stmt.execution_options(populate_existing=True))}


def move_stock(
    db: Session,
    product: Product,
    movement_type: MovementType,
    quantity: int,
    reason: MovementReason,
    *,
    order: Order | None = None,
    purchase_order: PurchaseOrder | None = None,
    note: str | None = None,
) -> StockMovement:
    """Aplica a movimentação a um produto já travado por `lock_products`. Não faz commit."""
    if movement_type == MovementType.OUT and quantity > product.stock_quantity:
        raise ConflictError(
            f"Estoque insuficiente para {product.sku}: disponível {product.stock_quantity}, solicitado {quantity}",
            "INSUFFICIENT_STOCK",
        )
    delta = quantity if movement_type == MovementType.IN else -quantity
    product.stock_quantity += delta
    movement = StockMovement(
        product=product,
        order=order,
        purchase_order=purchase_order,
        movement_type=movement_type,
        reason=reason,
        quantity=quantity,
        balance_after=product.stock_quantity,
        note=note,
    )
    db.add(movement)
    return movement


def register_manual_movement(db: Session, product_id: int, data: MovementCreate) -> StockMovement:
    get_product(db, product_id)  # 404 antes de qualquer lock
    product = lock_products(db, [product_id])[product_id]
    if not product.is_active:
        raise ConflictError("O produto está desativado", "PRODUCT_INACTIVE")
    movement = move_stock(db, product, data.movement_type, data.quantity, data.reason, note=data.note)
    db.commit()
    return movement


def list_movements(db: Session, product_id: int, params: PageParams) -> dict:
    get_product(db, product_id)
    stmt = (
        select(StockMovement)
        .where(StockMovement.product_id == product_id)
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
    )
    return paginate(db, stmt, params)


def list_all_movements(db: Session, f: MovementFilters) -> dict:
    """Histórico geral, do mais recente para o mais antigo, já com o produto carregado."""
    stmt = (
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
    )
    if f.product_id is not None:
        stmt = stmt.where(StockMovement.product_id == f.product_id)
    if f.movement_type is not None:
        stmt = stmt.where(StockMovement.movement_type == f.movement_type)
    if f.reason is not None:
        stmt = stmt.where(StockMovement.reason == f.reason)
    if f.created_from:
        stmt = stmt.where(StockMovement.created_at >= clock.start_of_day(f.created_from))
    if f.created_to:
        stmt = stmt.where(StockMovement.created_at < clock.end_of_day_exclusive(f.created_to))
    return paginate(db, stmt, f)


def low_stock(db: Session, params: PageParams) -> dict:
    """Produtos ativos com saldo no mínimo ou abaixo; os mais críticos primeiro."""
    stmt = (
        select(Product)
        .where(Product.is_active.is_(True), Product.stock_quantity <= Product.min_stock)
        .order_by((Product.stock_quantity - Product.min_stock).asc(), Product.id)
    )
    return paginate(db, stmt, params)
