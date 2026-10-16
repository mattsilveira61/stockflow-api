from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AliasPath, BaseModel, ConfigDict, Field, StringConstraints, computed_field

from app.models import PurchaseStatus
from app.schemas.common import InputModel, Name, PageParams
from app.schemas.customer import Email

Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


# ---- Fornecedores ---------------------------------------------------------------------

class SupplierCreate(InputModel):
    name: Name
    email: Email | None = None
    phone: Phone | None = None


class SupplierUpdate(InputModel):
    name: Name | None = None
    email: Email | None = None
    phone: Phone | None = None
    is_active: bool | None = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SupplierFilters(PageParams):
    q: str | None = None
    active: bool | None = None


# ---- Pedidos de compra ----------------------------------------------------------------

class PurchaseItemIn(InputModel):
    product_id: int
    quantity: Annotated[int, Field(gt=0, le=100_000)]
    unit_cost: Annotated[Decimal, Field(ge=0, le=1_000_000, max_digits=12, decimal_places=2)]


class PurchaseCreate(InputModel):
    """Nasce como rascunho. Itens repetidos do mesmo produto são recusados (custo ambíguo)."""

    supplier_id: int
    items: Annotated[list[PurchaseItemIn], Field(min_length=1, max_length=100)]
    note: Note | None = None


class PurchaseUpdate(InputModel):
    """Só no rascunho. `items`, se enviado, substitui a lista inteira."""

    supplier_id: int | None = None
    items: Annotated[list[PurchaseItemIn], Field(min_length=1, max_length=100)] | None = None
    note: Note | None = None


class PurchaseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    sku: str = Field(validation_alias=AliasPath("product", "sku"))
    name: str = Field(validation_alias=AliasPath("product", "name"))
    quantity: int
    unit_cost: Decimal

    @computed_field
    @property
    def subtotal(self) -> Decimal:
        return self.unit_cost * self.quantity


class PurchaseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_id: int
    supplier_name: str = Field(validation_alias=AliasPath("supplier", "name"))
    status: PurchaseStatus
    total_cost: Decimal
    note: str | None
    ordered_at: datetime | None
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PurchaseOut(PurchaseSummary):
    items: list[PurchaseItemOut]


class PurchaseFilters(PageParams):
    supplier_id: int | None = None
    status: PurchaseStatus | None = None


class RestockSuggestion(BaseModel):
    """Produto abaixo do mínimo e quanto comprar para chegar ao dobro do mínimo."""

    product_id: int
    sku: str
    name: str
    stock_quantity: int
    min_stock: int
    suggested_quantity: int
