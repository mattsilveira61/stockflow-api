"""Dados fictícios de demonstração. Idempotente: rodar de novo não duplica nada.

Uso: python -m app.seed
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Category, Customer, MovementReason, MovementType, Product, StockMovement

CATEGORIES = {
    "Bebidas": "Refrigerantes, sucos e águas",
    "Mercearia": "Grãos, massas e enlatados",
    "Limpeza": "Produtos de limpeza doméstica",
}

# sku, nome, categoria, preço, estoque inicial, estoque mínimo
PRODUCTS = [
    ("BEB-001", "Água mineral 500 ml", "Bebidas", "2.50", 120, 30),
    ("BEB-002", "Suco de laranja 1 L", "Bebidas", "8.90", 18, 20),
    ("BEB-003", "Refrigerante cola 2 L", "Bebidas", "9.49", 40, 15),
    ("MER-001", "Arroz branco 5 kg", "Mercearia", "27.90", 25, 10),
    ("MER-002", "Feijão carioca 1 kg", "Mercearia", "8.49", 6, 10),
    ("MER-003", "Macarrão espaguete 500 g", "Mercearia", "4.79", 60, 20),
    ("LIM-001", "Detergente 500 ml", "Limpeza", "2.99", 80, 25),
    ("LIM-002", "Sabão em pó 1 kg", "Limpeza", "14.90", 0, 5),
]

CUSTOMERS = [
    ("Ana Souza", "ana.souza@exemplo.com"),
    ("Bruno Lima", "bruno.lima@exemplo.com"),
    ("Carla Mendes", "carla.mendes@exemplo.com"),
]


def seed(db: Session) -> None:
    categories = {}
    for name, description in CATEGORIES.items():
        cat = db.scalar(select(Category).where(Category.name == name))
        if cat is None:
            cat = Category(name=name, description=description)
            db.add(cat)
        categories[name] = cat

    for sku, name, cat_name, price, stock, min_stock in PRODUCTS:
        if db.scalar(select(Product).where(Product.sku == sku)):
            continue
        product = Product(
            sku=sku,
            name=name,
            category=categories[cat_name],
            unit_price=Decimal(price),
            min_stock=min_stock,
            stock_quantity=stock,
        )
        db.add(product)
        # Saldo inicial também deixa rastro no histórico.
        if stock:
            db.add(
                StockMovement(
                    product=product,
                    movement_type=MovementType.IN,
                    reason=MovementReason.PURCHASE,
                    quantity=stock,
                    note="Estoque inicial (seed)",
                )
            )

    for name, email in CUSTOMERS:
        if not db.scalar(select(Customer).where(Customer.email == email)):
            db.add(Customer(name=name, email=email))

    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
        print(f"Seed ok: {db.query(Product).count()} produtos, {db.query(Customer).count()} clientes.")


if __name__ == "__main__":
    main()
