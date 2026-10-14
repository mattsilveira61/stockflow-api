"""Números do painel. Só pedidos CONFIRMED contam como venda; cancelados aparecem à parte."""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core import clock
from app.models import Order, OrderItem, OrderStatus, Product, StockMovement

CENTS = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(CENTS)


def get_dashboard(db: Session, days: int) -> dict:
    end = clock.today()
    start = end - timedelta(days=days - 1)
    in_period = (Order.created_at >= clock.start_of_day(start), Order.created_at < clock.end_of_day_exclusive(end))
    confirmed = Order.status == OrderStatus.CONFIRMED

    revenue, orders = db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0), func.count()).where(*in_period, confirmed)
    ).one()
    cancelled = db.scalar(
        select(func.count()).select_from(Order).where(*in_period, Order.status == OrderStatus.CANCELLED)
    )
    items_sold = db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity), 0)).join(OrderItem.order).where(*in_period, confirmed)
    )

    stock_value, active_products, low, out = db.execute(
        select(
            func.coalesce(func.sum(Product.unit_price * Product.stock_quantity), 0),
            func.count(),
            func.count().filter(Product.stock_quantity <= Product.min_stock),
            func.count().filter(Product.stock_quantity == 0),
        ).where(Product.is_active.is_(True))
    ).one()

    # Vendas por dia local, com os dias sem venda preenchidos com zero (o gráfico não "pula" dias).
    day = clock.local_date(Order.created_at).label("day")
    rows = db.execute(
        select(day, func.count(), func.sum(Order.total_amount)).where(*in_period, confirmed).group_by(day)
    ).all()
    by_day = {d: (n, total) for d, n, total in rows}
    sales_by_day = []
    for i in range(days):
        d = start + timedelta(days=i)
        n, total = by_day.get(d, (0, 0))
        sales_by_day.append({"date": d, "orders": n, "revenue": _money(total)})

    qty = func.sum(OrderItem.quantity).label("qty")
    top = db.execute(
        select(Product.id, Product.sku, Product.name, qty, func.sum(OrderItem.quantity * OrderItem.unit_price))
        .select_from(OrderItem)
        .join(OrderItem.product)
        .join(OrderItem.order)
        .where(*in_period, confirmed)
        .group_by(Product.id)
        .order_by(qty.desc(), Product.id)
        .limit(5)
    ).all()

    recent = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(10)
    ).all()

    revenue = _money(revenue)
    return {
        "start": start,
        "end": end,
        "days": days,
        "kpis": {
            "revenue": revenue,
            "orders": orders,
            "average_ticket": _money(revenue / orders) if orders else _money(0),
            "cancelled_orders": cancelled,
            "items_sold": items_sold,
            "stock_value": _money(stock_value),
            "active_products": active_products,
            "low_stock_count": low,
            "out_of_stock_count": out,
        },
        "sales_by_day": sales_by_day,
        "top_products": [
            {"product_id": pid, "sku": sku, "name": name, "quantity": q, "revenue": _money(r)}
            for pid, sku, name, q, r in top
        ],
        "recent_movements": recent,
    }
