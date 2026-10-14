from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.common import Page, PageParams
from app.schemas.product import ProductOut
from app.services import inventory

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/low-stock", response_model=Page[ProductOut])
def low_stock(db: DbSession, params: Annotated[PageParams, Query()]):
    """Produtos ativos com `stock_quantity <= min_stock`, do mais crítico para o menos."""
    return inventory.low_stock(db, params)
