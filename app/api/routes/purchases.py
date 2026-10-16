from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.schemas.common import Page, error_responses, write_responses
from app.schemas.purchase import (
    PurchaseCreate,
    PurchaseFilters,
    PurchaseOut,
    PurchaseSummary,
    PurchaseUpdate,
    RestockSuggestion,
)
from app.services import purchases

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get("", response_model=Page[PurchaseSummary])
def list_purchases(db: DbSession, filters: Annotated[PurchaseFilters, Query()]):
    return purchases.list_purchases(db, filters)


@router.get("/suggestions", response_model=list[RestockSuggestion])
def restock_suggestions(db: DbSession):
    """Produtos no estoque mínimo ou abaixo, já descontando compras enviadas e ainda não recebidas.

    A quantidade sugerida leva o saldo (mais o que está a caminho) ao dobro do mínimo.
    """
    return purchases.restock_suggestions(db)


@router.post("", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED, responses=write_responses(404, 409))
def create_purchase(db: DbSession, data: PurchaseCreate):
    """Cria o pedido de compra como rascunho (DRAFT). O estoque não muda até o recebimento."""
    return purchases.create_purchase(db, data)


@router.get("/{purchase_id}", response_model=PurchaseOut, responses=error_responses(404))
def get_purchase(db: DbSession, purchase_id: int):
    return purchases.get_purchase(db, purchase_id)


@router.patch("/{purchase_id}", response_model=PurchaseOut, responses=write_responses(404, 409))
def update_purchase(db: DbSession, purchase_id: int, data: PurchaseUpdate):
    """Só no rascunho. `items`, se enviado, substitui a lista inteira."""
    return purchases.update_purchase(db, purchase_id, data)


@router.post("/{purchase_id}/send", response_model=PurchaseOut, responses=write_responses(404, 409))
def send_purchase(db: DbSession, purchase_id: int):
    """DRAFT → ORDERED: o pedido foi enviado ao fornecedor e não pode mais ser editado."""
    return purchases.send_purchase(db, purchase_id)


@router.post("/{purchase_id}/receive", response_model=PurchaseOut, responses=write_responses(404, 409))
def receive_purchase(db: DbSession, purchase_id: int):
    """ORDERED → RECEIVED: dá entrada de todos os itens (movimentação PURCHASE) numa transação só.

    Receber de novo responde 409 e não muda o estoque.
    """
    return purchases.receive_purchase(db, purchase_id)


@router.post("/{purchase_id}/cancel", response_model=PurchaseOut, responses=write_responses(404, 409))
def cancel_purchase(db: DbSession, purchase_id: int):
    """DRAFT ou ORDERED → CANCELLED. Compra recebida não cancela (o estoque já entrou)."""
    return purchases.cancel_purchase(db, purchase_id)
