from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin, enum_check
from app.models.product import Product


class Supplier(TimestampMixin, Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")


class PurchaseStatus(StrEnum):
    DRAFT = "DRAFT"  # montando: itens podem mudar
    ORDERED = "ORDERED"  # enviado ao fornecedor, aguardando a mercadoria
    RECEIVED = "RECEIVED"  # mercadoria conferida: o estoque já entrou
    CANCELLED = "CANCELLED"


class PurchaseOrder(TimestampMixin, Base):
    """Pedido de compra: o estoque só sobe no recebimento, com uma movimentação PURCHASE por item."""

    __tablename__ = "purchase_orders"
    __table_args__ = (
        enum_check("status", PurchaseStatus, "status_valid"),
        CheckConstraint("total_cost >= 0", name="total_non_negative"),
        # Recebido sempre tem a data do recebimento
        CheckConstraint("status <> 'RECEIVED' OR received_at IS NOT NULL", name="received_at_required"),
        Index(None, "supplier_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    status: Mapped[PurchaseStatus] = mapped_column(String(20), default=PurchaseStatus.DRAFT, index=True)
    # Calculado no backend a partir dos itens.
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    note: Mapped[str | None] = mapped_column(Text)
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    supplier: Mapped[Supplier] = relationship()
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        back_populates="purchase_order", cascade="all, delete-orphan", order_by="PurchaseOrderItem.product_id"
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        UniqueConstraint("purchase_order_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int]
    # Custo combinado com o fornecedor (diferente do preço de venda do produto).
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()
