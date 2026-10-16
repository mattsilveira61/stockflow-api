"""Regras de cadastro de categorias e produtos (o saldo de estoque não passa por aqui)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Category, Product
from app.schemas.category import CategoryCreate, CategoryFilters, CategoryUpdate
from app.schemas.common import order_by_param, paginate, text_search
from app.schemas.product import ProductCreate, ProductFilters, ProductUpdate

# Ordem alfabética que respeita acentos ("Água" junto do "A"); a colação padrão compara bytes.
TEXT_COLLATION = "und-x-icu"

PRODUCT_SORT = {
    "id": Product.id,
    "name": Product.name.collate(TEXT_COLLATION),
    "sku": Product.sku,
    "unit_price": Product.unit_price,
    "stock_quantity": Product.stock_quantity,
    "created_at": Product.created_at,
}


# ---- Categorias --------------------------------------------------------------------


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Categoria não encontrada", "CATEGORY_NOT_FOUND")
    return category


def _ensure_category_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Category.id).where(func.lower(Category.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt):
        raise ConflictError("Já existe uma categoria com esse nome", "CATEGORY_NAME_TAKEN")


def list_categories(db: Session, f: CategoryFilters) -> dict:
    stmt = select(Category).order_by(Category.name.collate(TEXT_COLLATION), Category.id)
    if f.is_active is not None:
        stmt = stmt.where(Category.is_active == f.is_active)
    return paginate(db, stmt, f)


def create_category(db: Session, data: CategoryCreate) -> Category:
    _ensure_category_name_free(db, data.name)
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    return category


def update_category(db: Session, category_id: int, data: CategoryUpdate) -> Category:
    category = get_category(db, category_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in changes:
        _ensure_category_name_free(db, changes["name"], exclude_id=category_id)
    for field, value in changes.items():
        setattr(category, field, value)
    db.commit()
    return category


# ---- Produtos ----------------------------------------------------------------------


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Produto não encontrado", "PRODUCT_NOT_FOUND")
    return product


def _active_category(db: Session, category_id: int) -> Category:
    category = get_category(db, category_id)
    if not category.is_active:
        raise ConflictError("A categoria está desativada", "CATEGORY_INACTIVE")
    return category


def _ensure_sku_free(db: Session, sku: str, exclude_id: int | None = None) -> None:
    stmt = select(Product.id).where(Product.sku == sku)
    if exclude_id is not None:
        stmt = stmt.where(Product.id != exclude_id)
    if db.scalar(stmt):
        raise ConflictError("Já existe um produto com esse SKU", "SKU_TAKEN")


def products_query(f: ProductFilters):
    """Mesma consulta da listagem e da exportação CSV."""
    stmt = select(Product).order_by(*order_by_param(f.sort, PRODUCT_SORT))
    if f.q and f.q.strip():
        stmt = stmt.where(text_search(f.q, Product.name, Product.sku))
    if f.category_id is not None:
        stmt = stmt.where(Product.category_id == f.category_id)
    if f.is_active is not None:
        stmt = stmt.where(Product.is_active == f.is_active)
    return stmt


def list_products(db: Session, f: ProductFilters) -> dict:
    return paginate(db, products_query(f), f)


def create_product(db: Session, data: ProductCreate) -> Product:
    _active_category(db, data.category_id)
    _ensure_sku_free(db, data.sku)
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    return product


def update_product(db: Session, product_id: int, data: ProductUpdate) -> Product:
    product = get_product(db, product_id)
    changes = data.model_dump(exclude_unset=True)
    # Só a descrição pode ser apagada com null; nos outros campos null é ignorado.
    changes = {k: v for k, v in changes.items() if v is not None or k == "description"}
    if "category_id" in changes and changes["category_id"] != product.category_id:
        _active_category(db, changes["category_id"])
    if "sku" in changes:
        _ensure_sku_free(db, changes["sku"], exclude_id=product_id)
    for field, value in changes.items():
        setattr(product, field, value)
    db.commit()
    return product
