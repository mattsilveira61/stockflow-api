from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import InputModel, Name, PageParams

Sku = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=50)]
Price = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
MinStock = Annotated[int, Field(ge=0)]


# stock_quantity fica de fora de propósito: o saldo só muda por movimentações (InputModel recusa o campo).
class ProductCreate(InputModel):
    sku: Sku
    name: Name
    description: str | None = None
    unit_price: Price
    min_stock: MinStock = 0
    category_id: int


class ProductUpdate(InputModel):
    sku: Sku | None = None
    name: Name | None = None
    description: str | None = None
    unit_price: Price | None = None
    min_stock: MinStock | None = None
    category_id: int | None = None
    is_active: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    description: str | None
    unit_price: Decimal
    stock_quantity: int
    min_stock: int
    category_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductImportResult(BaseModel):
    created: int
    updated: int
    unchanged: int
    dry_run: bool


ProductSort = Literal[
    "name", "-name", "sku", "-sku", "unit_price", "-unit_price",
    "stock_quantity", "-stock_quantity", "created_at", "-created_at", "id", "-id",
]  # fmt: skip


class ProductFilters(PageParams):
    q: str | None = Query(None, description="Busca parcial por nome ou SKU")
    category_id: int | None = None
    is_active: bool | None = None
    sort: ProductSort = "name"
