from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.schemas.common import Page, error_responses
from app.schemas.product import ProductCreate, ProductFilters, ProductOut, ProductUpdate
from app.services import catalog

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=Page[ProductOut])
def list_products(db: DbSession, filters: Annotated[ProductFilters, Query()]):
    return catalog.list_products(db, filters)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED, responses=error_responses(404, 409))
def create_product(db: DbSession, data: ProductCreate):
    """O produto nasce com saldo 0; o estoque entra por `POST /products/{id}/movements`."""
    return catalog.create_product(db, data)


@router.get("/{product_id}", response_model=ProductOut, responses=error_responses(404))
def get_product(db: DbSession, product_id: int):
    return catalog.get_product(db, product_id)


@router.patch("/{product_id}", response_model=ProductOut, responses=error_responses(404, 409))
def update_product(db: DbSession, product_id: int, data: ProductUpdate):
    """Altera os dados cadastrais ou desativa (`is_active: false`). O saldo não pode ser alterado aqui."""
    return catalog.update_product(db, product_id, data)
