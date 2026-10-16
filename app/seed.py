"""Dados fictícios de demonstração. Idempotente: rodar de novo não duplica nada.

Cria categorias, produtos e clientes e, se ainda não houver pedidos, simula ~60 dias de
operação: compras de reposição, ~120 pedidos e alguns cancelamentos. Os pedidos passam
pelos mesmos services da API, então saldo, histórico e `balance_after` sempre batem.
Aleatoriedade com semente fixa: o resultado é sempre o mesmo.

Uso: python -m app.seed
"""

import random
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core import clock
from app.db.session import SessionLocal
from app.models import (
    Category,
    Customer,
    MovementReason,
    MovementType,
    Order,
    Product,
    PurchaseOrder,
    StockMovement,
    Supplier,
)
from app.schemas.order import OrderCreate
from app.schemas.purchase import PurchaseCreate
from app.services import orders as order_service
from app.services import purchases as purchase_service
from app.services.inventory import lock_products, move_stock

CATEGORIES = {
    "Bebidas": "Refrigerantes, sucos e águas",
    "Mercearia": "Grãos, massas e enlatados",
    "Limpeza": "Produtos de limpeza doméstica",
    "Higiene": "Cuidados pessoais",
    "Padaria": "Pães, bolos e biscoitos",
}

# sku, nome, categoria, preço, estoque inicial, estoque mínimo, popularidade (peso no sorteio)
PRODUCTS = [
    ("BEB-001", "Água mineral 500 ml", "Bebidas", "2.50", 300, 60, 9),
    ("BEB-002", "Suco de laranja 1 L", "Bebidas", "8.90", 80, 20, 5),
    ("BEB-003", "Refrigerante cola 2 L", "Bebidas", "9.49", 120, 30, 8),
    ("BEB-004", "Café torrado 500 g", "Bebidas", "18.90", 60, 15, 6),
    ("BEB-005", "Chá mate 1 L", "Bebidas", "6.49", 40, 10, 2),
    ("BEB-006", "Água com gás 500 ml", "Bebidas", "3.20", 90, 20, 3),
    ("MER-001", "Arroz branco 5 kg", "Mercearia", "27.90", 70, 15, 7),
    ("MER-002", "Feijão carioca 1 kg", "Mercearia", "8.49", 90, 25, 7),
    ("MER-003", "Macarrão espaguete 500 g", "Mercearia", "4.79", 110, 25, 6),
    ("MER-004", "Óleo de soja 900 ml", "Mercearia", "7.99", 80, 20, 5),
    ("MER-005", "Açúcar refinado 1 kg", "Mercearia", "4.99", 80, 20, 4),
    ("MER-006", "Molho de tomate 340 g", "Mercearia", "3.49", 100, 25, 4),
    ("MER-007", "Farinha de trigo 1 kg", "Mercearia", "5.29", 50, 15, 2),
    ("MER-008", "Atum em lata 170 g", "Mercearia", "9.90", 45, 12, 3),
    ("LIM-001", "Detergente 500 ml", "Limpeza", "2.99", 150, 30, 6),
    ("LIM-002", "Sabão em pó 1 kg", "Limpeza", "14.90", 30, 10, 4),
    ("LIM-003", "Água sanitária 2 L", "Limpeza", "6.99", 50, 15, 3),
    ("LIM-004", "Desinfetante 2 L", "Limpeza", "11.90", 35, 10, 3),
    ("LIM-005", "Esponja multiuso (3 un)", "Limpeza", "5.49", 60, 15, 2),
    ("LIM-006", "Papel toalha (2 rolos)", "Limpeza", "7.90", 40, 10, 2),
    ("HIG-001", "Sabonete 85 g", "Higiene", "2.29", 160, 40, 5),
    ("HIG-002", "Creme dental 90 g", "Higiene", "4.59", 90, 20, 4),
    ("HIG-003", "Shampoo 350 ml", "Higiene", "16.90", 30, 10, 3),
    ("HIG-004", "Papel higiênico (12 rolos)", "Higiene", "21.90", 50, 15, 5),
    ("HIG-005", "Desodorante aerossol", "Higiene", "13.49", 25, 10, 2),
    ("PAD-001", "Pão de forma 500 g", "Padaria", "8.99", 60, 15, 6),
    ("PAD-002", "Biscoito recheado 140 g", "Padaria", "3.29", 120, 30, 5),
    ("PAD-003", "Bolo de chocolate 400 g", "Padaria", "14.50", 20, 8, 2),
    ("PAD-004", "Torrada integral 160 g", "Padaria", "6.79", 25, 10, 1),
    ("PAD-005", "Panetone 500 g", "Padaria", "24.90", 15, 5, 1),
]

# Fornecedor de cada categoria (as reposições da simulação viram pedidos de compra deles)
SUPPLIERS = {
    "Bebidas": ("Distribuidora Rio Claro", "pedidos@rioclaro.example", "(11) 4002-1001"),
    "Mercearia": ("Atacadão Bom Preço", "compras@bompreco.example", "(11) 4002-1002"),
    "Limpeza": ("Limpa Tudo Distribuidora", "vendas@limpatudo.example", "(11) 4002-1003"),
    "Higiene": ("Limpa Tudo Distribuidora", "vendas@limpatudo.example", "(11) 4002-1003"),
    "Padaria": ("Panificadora Trigo Bom", "contato@trigobom.example", None),
}
# Custo de compra: 60% do preço de venda
COST_RATE = Decimal("0.60")

# Produtos que a simulação não repõe: terminam com estoque baixo ou zerado para o relatório.
NO_RESTOCK = {"LIM-002", "HIG-005", "PAD-003", "BEB-002", "MER-008"}

CUSTOMERS = [
    ("Ana Souza", "ana.souza@exemplo.com"),
    ("Bruno Lima", "bruno.lima@exemplo.com"),
    ("Carla Mendes", "carla.mendes@exemplo.com"),
    ("Diego Ferreira", "diego.ferreira@exemplo.com"),
    ("Eduarda Rocha", "eduarda.rocha@exemplo.com"),
    ("Felipe Araújo", "felipe.araujo@exemplo.com"),
    ("Gabriela Nunes", "gabriela.nunes@exemplo.com"),
    ("Henrique Costa", "henrique.costa@exemplo.com"),
    ("Isabela Martins", "isabela.martins@exemplo.com"),
    ("João Pereira", "joao.pereira@exemplo.com"),
]

HISTORY_DAYS = 60
ORDER_COUNT = 120
CANCEL_RATE = 0.08


def seed_catalog(db: Session) -> None:
    categories = {}
    for name, description in CATEGORIES.items():
        cat = db.scalar(select(Category).where(Category.name == name))
        if cat is None:
            cat = Category(name=name, description=description)
            db.add(cat)
        categories[name] = cat

    for sku, name, cat_name, price, _stock, min_stock, _weight in PRODUCTS:
        if not db.scalar(select(Product.id).where(Product.sku == sku)):
            category = categories[cat_name]
            db.add(Product(sku=sku, name=name, category=category, unit_price=Decimal(price), min_stock=min_stock))

    for name, email in CUSTOMERS:
        if not db.scalar(select(Customer.id).where(Customer.email == email)):
            db.add(Customer(name=name, email=email))

    db.commit()


def _backdate(db: Session, when: datetime, *, order_id: int | None = None, movement_ids: list[int] = ()) -> None:
    """A simulação roda agora, mas cada evento é gravado com a data em que "aconteceu"."""
    if order_id is not None:
        db.execute(update(Order).where(Order.id == order_id).values(created_at=when, updated_at=when))
    if movement_ids:
        db.execute(update(StockMovement).where(StockMovement.id.in_(movement_ids)).values(created_at=when))
    db.commit()


def _purchase(db: Session, product_ids: list[int], quantities: dict[int, int], note: str) -> list[int]:
    products = lock_products(db, product_ids)
    moves = [
        move_stock(db, products[pid], MovementType.IN, quantities[pid], MovementReason.PURCHASE, note=note)
        for pid in sorted(product_ids)
    ]
    db.flush()
    ids = [m.id for m in moves]
    db.commit()
    return ids


def _seed_suppliers(db: Session) -> None:
    existing = set(db.scalars(select(Supplier.name)))
    for name, email, phone in dict.fromkeys(SUPPLIERS.values()):
        if name not in existing:
            db.add(Supplier(name=name, email=email, phone=phone))
    db.commit()


def _supplier_for(db: Session, product: Product) -> Supplier:
    name = SUPPLIERS[product.category.name][0]
    return db.scalar(select(Supplier).where(Supplier.name == name))


def _cost(product: Product) -> Decimal:
    return (product.unit_price * COST_RATE).quantize(Decimal("0.01"))


def _restock(db: Session, quantities: dict[int, int], when: datetime) -> None:
    """Reposição como na vida real: um pedido de compra por fornecedor, enviado e recebido."""
    by_supplier: dict[int, dict[int, int]] = {}
    for pid, qty in quantities.items():
        by_supplier.setdefault(_supplier_for(db, db.get(Product, pid)).id, {})[pid] = qty
    for supplier_id, items in sorted(by_supplier.items()):
        po = _new_purchase(db, supplier_id, items)
        purchase_service.send_purchase(db, po.id)
        purchase_service.receive_purchase(db, po.id)
        ids = list(db.scalars(select(StockMovement.id).where(StockMovement.purchase_order_id == po.id)))
        _backdate(db, when, movement_ids=ids)
        db.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.id == po.id)
            .values(
                created_at=when - timedelta(days=2),
                ordered_at=when - timedelta(days=2),
                received_at=when,
                updated_at=when,
            )
        )
        db.commit()


def _new_purchase(db: Session, supplier_id: int, items: dict[int, int], note: str | None = None) -> PurchaseOrder:
    data = PurchaseCreate(
        supplier_id=supplier_id,
        items=[
            {"product_id": pid, "quantity": q, "unit_cost": _cost(db.get(Product, pid))} for pid, q in items.items()
        ],
        note=note,
    )
    return purchase_service.create_purchase(db, data)


def _open_purchases(db: Session) -> None:
    """Para a demonstração ter o que receber: uma compra enviada e um rascunho dos produtos em falta."""
    suggestions = purchase_service.restock_suggestions(db)
    by_supplier: dict[int, dict[int, int]] = {}
    for s in suggestions:
        supplier = _supplier_for(db, db.get(Product, s.product_id))
        by_supplier.setdefault(supplier.id, {})[s.product_id] = s.suggested_quantity
    groups = sorted(by_supplier.items())
    if groups:
        sent = _new_purchase(db, *groups[0], note="Pedido semanal")
        purchase_service.send_purchase(db, sent.id)
    if len(groups) > 1:
        _new_purchase(db, *groups[1], note="Conferir preço antes de enviar")


def seed_history(db: Session) -> None:
    """Simula a operação da loja. Só roda com o banco sem pedidos (idempotência)."""
    if db.scalar(select(func.count()).select_from(Order)):
        return

    rng = random.Random(42)
    by_sku = {p.sku: p for p in db.scalars(select(Product).where(Product.sku.in_([row[0] for row in PRODUCTS])))}
    spec = {row[0]: row for row in PRODUCTS}
    customer_ids = list(db.scalars(select(Customer.id).where(Customer.email.in_([e for _, e in CUSTOMERS]))))
    skus = list(spec)
    weights = [spec[s][6] for s in skus]

    # Meia-noite local de 60 dias atrás: as horas sorteadas abaixo caem no horário comercial.
    start = clock.start_of_day(clock.today() - timedelta(days=HISTORY_DAYS))

    # Estoque inicial: uma compra por produto, um dia antes do primeiro pedido.
    if not db.scalar(select(func.count()).select_from(StockMovement)):
        initial = {by_sku[s].id: spec[s][4] for s in skus}
        ids = _purchase(db, list(initial), initial, "Estoque inicial")
        _backdate(db, start - timedelta(days=1), movement_ids=ids)

    # Horários dos pedidos espalhados pelo período (horário comercial), em ordem.
    moments = sorted(
        (start + timedelta(days=rng.randrange(HISTORY_DAYS + 1), hours=rng.randint(8, 20), minutes=rng.randrange(60)))
        for _ in range(ORDER_COUNT)
    )
    moments = [m for m in moments if m < clock.now() - timedelta(minutes=10)]

    for n, when in enumerate(moments):
        lines: dict[int, int] = {}
        for sku in rng.choices(skus, weights=weights, k=rng.randint(1, 4)):
            lines[by_sku[sku].id] = lines.get(by_sku[sku].id, 0) + rng.randint(1, 6)

        # Reposição antes do pedido quando algum produto ficaria abaixo do mínimo.
        restock = {}
        for pid, qty in lines.items():
            product = db.get(Product, pid)
            db.refresh(product)
            if product.sku in NO_RESTOCK:
                lines[pid] = min(qty, product.stock_quantity)
            elif product.stock_quantity - qty <= product.min_stock:
                # Repõe o bastante para ficar acima do mínimo mesmo depois deste pedido.
                restock[pid] = spec[product.sku][4] + qty
        lines = {pid: q for pid, q in lines.items() if q > 0}
        if not lines:
            continue
        if restock:
            _restock(db, restock, when - timedelta(hours=2))

        data = OrderCreate(
            customer_id=rng.choice(customer_ids),
            items=[{"product_id": pid, "quantity": q} for pid, q in lines.items()],
        )
        order, _ = order_service.create_order(db, data, idempotency_key=f"seed-{n:04d}")
        sale_ids = list(db.scalars(select(StockMovement.id).where(StockMovement.order_id == order.id)))
        _backdate(db, when, order_id=order.id, movement_ids=sale_ids)

        if rng.random() < CANCEL_RATE:
            order_service.cancel_order(db, order.id)
            cancel_ids = list(
                db.scalars(
                    select(StockMovement.id).where(
                        StockMovement.order_id == order.id, StockMovement.reason == MovementReason.CANCELLATION
                    )
                )
            )
            cancelled_at = when + timedelta(minutes=30)
            _backdate(db, cancelled_at, movement_ids=cancel_ids)
            db.execute(update(Order).where(Order.id == order.id).values(updated_at=cancelled_at))
            db.commit()


def seed(db: Session) -> None:
    seed_catalog(db)
    _seed_suppliers(db)
    if not db.scalar(select(func.count()).select_from(Order)):
        seed_history(db)
        _open_purchases(db)


def main() -> None:
    with SessionLocal() as db:
        seed(db)
        count = lambda model: db.scalar(select(func.count()).select_from(model))  # noqa: E731
        print(
            f"Seed ok: {count(Product)} produtos, {count(Customer)} clientes, "
            f"{count(Order)} pedidos, {count(StockMovement)} movimentações."
        )


if __name__ == "__main__":
    main()
