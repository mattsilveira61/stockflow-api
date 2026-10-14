"""Pedidos: criação e cancelamento atômicos.

Cada operação é uma transação só: ou o pedido, os itens, o saldo e as movimentações
mudam juntos, ou nada muda.
"""

from collections import Counter
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core import clock
from app.core.errors import ConflictError, NotFoundError
from app.models import MovementReason, MovementType, Order, OrderItem, OrderStatus
from app.schemas.common import paginate
from app.schemas.order import OrderCreate, OrderFilters
from app.services.customers import get_customer
from app.services.inventory import lock_products, move_stock

CENTS = Decimal("0.01")


def get_order(db: Session, order_id: int) -> Order:
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items).joinedload(OrderItem.product), joinedload(Order.customer))
        .execution_options(populate_existing=True)
    )
    order = db.scalar(stmt)
    if order is None:
        raise NotFoundError("Pedido não encontrado", "ORDER_NOT_FOUND")
    return order


def _find_by_key(db: Session, key: str) -> Order | None:
    order_id = db.scalar(select(Order.id).where(Order.idempotency_key == key))
    return get_order(db, order_id) if order_id else None


def _same_request(order: Order, data: OrderCreate, quantities: Counter) -> bool:
    return order.customer_id == data.customer_id and quantities == Counter(
        {i.product_id: i.quantity for i in order.items}
    )


def _replay(order: Order, data: OrderCreate, quantities: Counter) -> tuple[Order, bool]:
    """Mesma chave, mesmo conteúdo: devolve o pedido original. Conteúdo diferente: erro do cliente."""
    if not _same_request(order, data, quantities):
        raise ConflictError(
            "Essa Idempotency-Key já foi usada em um pedido com outro conteúdo", "IDEMPOTENCY_KEY_REUSED"
        )
    return order, False


def create_order(db: Session, data: OrderCreate, idempotency_key: str | None = None) -> tuple[Order, bool]:
    """Cria o pedido e baixa o estoque. Retorna (pedido, criado_agora)."""
    # Itens repetidos do mesmo produto viram uma linha só.
    quantities: Counter[int] = Counter()
    for item in data.items:
        quantities[item.product_id] += item.quantity

    if idempotency_key and (existing := _find_by_key(db, idempotency_key)):
        return _replay(existing, data, quantities)

    try:
        customer = get_customer(db, data.customer_id)
        products = lock_products(db, quantities)

        missing = sorted(set(quantities) - set(products))
        if missing:
            raise NotFoundError(f"Produto(s) não encontrado(s): {missing}", "PRODUCT_NOT_FOUND")
        inactive = sorted(p.sku for p in products.values() if not p.is_active)
        if inactive:
            raise ConflictError(f"Produto(s) desativado(s): {', '.join(inactive)}", "PRODUCT_INACTIVE")
        # Valida tudo antes de mexer em qualquer saldo, para a mensagem listar todos os faltantes.
        short = [
            f"{p.sku} (disponível {p.stock_quantity}, solicitado {quantities[pid]})"
            for pid, p in products.items()
            if quantities[pid] > p.stock_quantity
        ]
        if short:
            raise ConflictError(f"Estoque insuficiente: {'; '.join(short)}", "INSUFFICIENT_STOCK")

        order = Order(customer=customer, status=OrderStatus.CONFIRMED, idempotency_key=idempotency_key)
        total = Decimal("0")
        for pid, product in products.items():  # já em ordem de id
            qty = quantities[pid]
            # Preço congelado no item: alterar o produto depois não muda pedidos antigos.
            order.items.append(OrderItem(product=product, quantity=qty, unit_price=product.unit_price))
            total += product.unit_price * qty
            move_stock(db, product, MovementType.OUT, qty, MovementReason.SALE, order=order)
        order.total_amount = total.quantize(CENTS)
        db.add(order)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Duas requisições com a mesma chave ao mesmo tempo: a segunda bate na UNIQUE e devolve a primeira.
        if idempotency_key and (existing := _find_by_key(db, idempotency_key)):
            return _replay(existing, data, quantities)
        raise
    except Exception:
        db.rollback()
        raise

    return get_order(db, order.id), True


def cancel_order(db: Session, order_id: int) -> Order:
    order = get_order(db, order_id)
    try:
        # UPDATE condicional: só um cancelamento consegue mudar CONFIRMED -> CANCELLED.
        # Um segundo (mesmo simultâneo) espera o lock da linha, vê CANCELLED e não muda nada.
        changed = db.execute(
            update(Order)
            .where(Order.id == order_id, Order.status == OrderStatus.CONFIRMED)
            .values(status=OrderStatus.CANCELLED, updated_at=func.now())
            .returning(Order.id)
        ).scalar()
        if changed is None:
            raise ConflictError("O pedido já está cancelado", "ORDER_ALREADY_CANCELLED")

        products = lock_products(db, (i.product_id for i in order.items))
        for item in sorted(order.items, key=lambda i: i.product_id):
            move_stock(db, products[item.product_id], MovementType.IN, item.quantity, MovementReason.CANCELLATION, order=order)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_order(db, order_id)


def list_orders(db: Session, f: OrderFilters) -> dict:
    """Datas no fuso da loja; `created_to` inclui o dia inteiro."""
    stmt = select(Order).options(joinedload(Order.customer)).order_by(Order.created_at.desc(), Order.id.desc())
    if f.customer_id is not None:
        stmt = stmt.where(Order.customer_id == f.customer_id)
    if f.status is not None:
        stmt = stmt.where(Order.status == f.status)
    if f.created_from:
        stmt = stmt.where(Order.created_at >= clock.start_of_day(f.created_from))
    if f.created_to:
        stmt = stmt.where(Order.created_at < clock.end_of_day_exclusive(f.created_to))
    return paginate(db, stmt, f)
