from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.schemas.category import CategoryCreate, CategoryFilters, CategoryOut, CategoryUpdate
from app.schemas.common import Page, error_responses
from app.services import catalog

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=Page[CategoryOut])
def list_categories(db: DbSession, filters: Annotated[CategoryFilters, Query()]):
    return catalog.list_categories(db, filters)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED, responses=error_responses(409))
def create_category(db: DbSession, data: CategoryCreate):
    return catalog.create_category(db, data)


@router.get("/{category_id}", response_model=CategoryOut, responses=error_responses(404))
def get_category(db: DbSession, category_id: int):
    return catalog.get_category(db, category_id)


@router.patch("/{category_id}", response_model=CategoryOut, responses=error_responses(404, 409))
def update_category(db: DbSession, category_id: int, data: CategoryUpdate):
    """Atualiza dados ou desativa (`is_active: false`). Categorias não são apagadas."""
    return catalog.update_category(db, category_id, data)
