from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import Query
from pydantic import AliasPath, BaseModel, ConfigDict, Field, model_validator

from app.models import MovementReason, MovementType
from app.schemas.common import InputModel, PageParams


class MovementCreate(InputModel):
    """Movimentação manual. SALE e CANCELLATION são exclusivos dos pedidos."""

    movement_type: MovementType
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    reason: Literal[MovementReason.PURCHASE, MovementReason.ADJUSTMENT]
    note: Annotated[str | None, Field(max_length=500)] = None

    @model_validator(mode="after")
    def purchase_is_inbound(self):
        if self.reason == MovementReason.PURCHASE and self.movement_type != MovementType.IN:
            raise ValueError("PURCHASE só pode ser uma entrada (IN)")
        return self


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    order_id: int | None
    purchase_order_id: int | None
    movement_type: MovementType
    reason: MovementReason
    quantity: int
    balance_after: int
    note: str | None
    created_at: datetime


class MovementWithProduct(MovementOut):
    """Usado no histórico geral: traz o produto para a tela não precisar buscar um por um."""

    sku: str = Field(validation_alias=AliasPath("product", "sku"))
    product_name: str = Field(validation_alias=AliasPath("product", "name"))


class MovementFilters(PageParams):
    product_id: int | None = None
    movement_type: MovementType | None = None
    reason: MovementReason | None = None
    created_from: date | None = Query(None, description="Data inicial (inclusiva), AAAA-MM-DD")
    created_to: date | None = Query(None, description="Data final (inclusiva), AAAA-MM-DD")

    @model_validator(mode="after")
    def valid_range(self):
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("created_from deve ser anterior ou igual a created_to")
        return self
