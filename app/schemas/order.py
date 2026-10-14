from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import Query
from pydantic import AliasPath, BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models import OrderStatus
from app.schemas.common import InputModel, PageParams


class OrderItemIn(InputModel):
    product_id: int
    quantity: Annotated[int, Field(gt=0, le=10_000)]


class OrderCreate(InputModel):
    """Só produto e quantidade: preço e total são sempre calculados pelo backend."""

    customer_id: int
    items: Annotated[list[OrderItemIn], Field(min_length=1, max_length=100)]


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    sku: str = Field(validation_alias=AliasPath("product", "sku"))
    name: str = Field(validation_alias=AliasPath("product", "name"))
    quantity: int
    unit_price: Decimal

    @computed_field
    @property
    def subtotal(self) -> Decimal:
        return self.unit_price * self.quantity


class OrderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    status: OrderStatus
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime


class OrderOut(OrderSummary):
    items: list[OrderItemOut]


class OrderFilters(PageParams):
    customer_id: int | None = None
    status: OrderStatus | None = None
    created_from: date | None = Query(None, description="Data inicial (inclusiva), AAAA-MM-DD")
    created_to: date | None = Query(None, description="Data final (inclusiva), AAAA-MM-DD")

    @model_validator(mode="after")
    def valid_range(self):
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("created_from deve ser anterior ou igual a created_to")
        return self
