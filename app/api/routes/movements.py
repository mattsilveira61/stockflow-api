from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.common import Page
from app.schemas.stock_movement import MovementFilters, MovementWithProduct
from app.services import inventory

router = APIRouter(prefix="/movements", tags=["movements"])


@router.get("", response_model=Page[MovementWithProduct])
def list_movements(db: DbSession, filters: Annotated[MovementFilters, Query()]):
    """Histórico de todos os produtos. Para registrar uma movimentação, use `POST /products/{id}/movements`."""
    return inventory.list_all_movements(db, filters)
