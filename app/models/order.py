from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin, enum_check
from app.models.customer import Customer


class OrderStatus(StrEnum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        enum_check("status", OrderStatus, "status_valid"),
        CheckConstraint("total_amount >= 0", name="total_non_negative"),
        Index(None, "customer_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[OrderStatus] = mapped_column(String(20), default=OrderStatus.CONFIRMED)
    # Calculado no backend a partir dos itens; nunca vem do cliente da API.
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Chave enviada pelo cliente para que reenviar a mesma requisição não crie outro pedido.
    idempotency_key: Mapped[str | None] = mapped_column(String(100), unique=True)

    customer: Mapped[Customer] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(  # noqa: F821
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
