# Importar todos os models aqui para registrá-los no Base.metadata (usado pelo Alembic).
from app.models.category import Category
from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.stock_movement import MovementReason, MovementType, StockMovement

__all__ = [
    "Category",
    "Customer",
    "MovementReason",
    "MovementType",
    "Order",
    "OrderItem",
    "OrderStatus",
    "Product",
    "StockMovement",
]
