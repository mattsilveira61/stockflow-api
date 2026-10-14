from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.dashboard import Dashboard
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=Dashboard)
def get_dashboard(db: DbSession, days: Annotated[int, Query(ge=1, le=366)] = 30):
    """Indicadores dos últimos `days` dias (incluindo hoje, no fuso da loja). Cancelados não contam como venda."""
    return dashboard.get_dashboard(db, days)
