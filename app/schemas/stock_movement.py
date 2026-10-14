from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import MovementReason, MovementType
from app.schemas.common import InputModel


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
    movement_type: MovementType
    reason: MovementReason
    quantity: int
    balance_after: int
    note: str | None
    created_at: datetime
