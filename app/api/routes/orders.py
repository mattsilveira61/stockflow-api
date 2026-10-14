from typing import Annotated

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import DbSession
from app.schemas.common import Page, error_responses
from app.schemas.order import OrderCreate, OrderFilters, OrderOut, OrderSummary
from app.services import orders

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=Page[OrderSummary])
def list_orders(db: DbSession, filters: Annotated[OrderFilters, Query()]):
    return orders.list_orders(db, filters)


@router.post(
    "",
    response_model=OrderOut,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": OrderOut, "description": "Pedido já criado com essa Idempotency-Key"}}
    | error_responses(404, 409),
)
def create_order(
    db: DbSession,
    data: OrderCreate,
    response: Response,
    idempotency_key: Annotated[
        str | None,
        Header(min_length=1, max_length=100, description="Reenviar com a mesma chave não cria outro pedido"),
    ] = None,
):
    """Cria o pedido e baixa o estoque numa transação só. Preços e total vêm do cadastro, não do cliente."""
    order, created = orders.create_order(db, data, idempotency_key)
    if not created:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replayed"] = "true"
    return order


@router.get("/{order_id}", response_model=OrderOut, responses=error_responses(404))
def get_order(db: DbSession, order_id: int):
    return orders.get_order(db, order_id)


@router.post("/{order_id}/cancel", response_model=OrderOut, responses=error_responses(404, 409))
def cancel_order(db: DbSession, order_id: int):
    """Cancela e devolve o estoque. Cancelar de novo responde 409 e não devolve nada."""
    return orders.cancel_order(db, order_id)
