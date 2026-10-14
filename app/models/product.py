from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin
from app.models.category import Category


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        # Rede de segurança: mesmo que o código falhe, o banco nunca aceita saldo negativo.
        CheckConstraint("stock_quantity >= 0", name="stock_non_negative"),
        CheckConstraint("min_stock >= 0", name="min_stock_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Só muda via services/inventory (movimentações e pedidos), nunca pelo cadastro.
    stock_quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    min_stock: Mapped[int] = mapped_column(default=0, server_default="0")
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    category: Mapped[Category] = relationship(back_populates="products")
