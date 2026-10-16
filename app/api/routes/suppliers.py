from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import OPERATOR, DbSession
from app.schemas.common import Page, error_responses, write_responses
from app.schemas.purchase import SupplierCreate, SupplierFilters, SupplierOut, SupplierUpdate
from app.services import purchases

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=Page[SupplierOut])
def list_suppliers(db: DbSession, filters: Annotated[SupplierFilters, Query()]):
    return purchases.list_suppliers(db, filters)


@router.post(
    "",
    dependencies=OPERATOR,
    response_model=SupplierOut,
    status_code=status.HTTP_201_CREATED,
    responses=write_responses(409),
)
def create_supplier(db: DbSession, data: SupplierCreate):
    return purchases.create_supplier(db, data)


@router.get("/{supplier_id}", response_model=SupplierOut, responses=error_responses(404))
def get_supplier(db: DbSession, supplier_id: int):
    return purchases.get_supplier(db, supplier_id)


@router.patch("/{supplier_id}", dependencies=OPERATOR, response_model=SupplierOut, responses=write_responses(404, 409))
def update_supplier(db: DbSession, supplier_id: int, data: SupplierUpdate):
    """`is_active: false` desativa: o fornecedor some dos novos pedidos de compra, mas os antigos continuam."""
    return purchases.update_supplier(db, supplier_id, data)
