from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import enum_check
from app.models.order import Order
from app.models.product import Product
from app.models.purchase import PurchaseOrder


class MovementType(StrEnum):
    IN = "IN"
    OUT = "OUT"


class MovementReason(StrEnum):
    PURCHASE = "PURCHASE"  # entrada de mercadoria
    ADJUSTMENT = "ADJUSTMENT"  # ajuste manual (perda, inventário...)
    SALE = "SALE"  # baixa por pedido
    CANCELLATION = "CANCELLATION"  # devolução por pedido cancelado


class StockMovement(Base):
    """Histórico imutável: cada mudança de saldo gera uma linha, na mesma transação."""

    __tablename__ = "stock_movements"
    __table_args__ = (
        enum_check("movement_type", MovementType, "type_valid"),
        enum_check("reason", MovementReason, "reason_valid"),
        # O sentido vem de movement_type; a quantidade é sempre positiva.
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("balance_after >= 0", name="balance_after_non_negative"),
        Index(None, "product_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), index=True)
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    movement_type: Mapped[MovementType] = mapped_column(String(10))
    reason: Mapped[MovementReason] = mapped_column(String(20))
    quantity: Mapped[int]
    # Saldo do produto logo após este movimento: o histórico funciona como um extrato.
    balance_after: Mapped[int]
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped[Product] = relationship()
    order: Mapped[Order | None] = relationship()
    purchase_order: Mapped[PurchaseOrder | None] = relationship()
