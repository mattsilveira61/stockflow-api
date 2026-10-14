from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.stock_movement import MovementWithProduct


class DashboardKpis(BaseModel):
    revenue: Decimal
    orders: int
    average_ticket: Decimal
    cancelled_orders: int
    items_sold: int
    stock_value: Decimal
    active_products: int
    low_stock_count: int
    out_of_stock_count: int


class DailySales(BaseModel):
    date: date
    orders: int
    revenue: Decimal


class TopProduct(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: int
    revenue: Decimal


class Dashboard(BaseModel):
    start: date
    end: date
    days: int
    kpis: DashboardKpis
    sales_by_day: list[DailySales]
    top_products: list[TopProduct]
    recent_movements: list[MovementWithProduct]
