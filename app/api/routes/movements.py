from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession
from app.schemas.common import Page
from app.schemas.stock_movement import MovementFilters, MovementWithProduct
from app.services import csv_io, inventory

router = APIRouter(prefix="/movements", tags=["movements"])


@router.get("/export.csv", response_class=StreamingResponse)
def export_movements(db: DbSession, filters: Annotated[MovementFilters, Query()]):
    """Histórico em CSV (separador `;`) com os mesmos filtros da listagem, sem paginação."""
    return StreamingResponse(
        csv_io.export_movements(db, filters),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="movimentacoes.csv"'},
    )


@router.get("", response_model=Page[MovementWithProduct])
def list_movements(db: DbSession, filters: Annotated[MovementFilters, Query()]):
    """Histórico de todos os produtos. Para registrar uma movimentação, use `POST /products/{id}/movements`."""
    return inventory.list_all_movements(db, filters)
