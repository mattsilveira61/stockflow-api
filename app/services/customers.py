from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Customer
from app.schemas.common import paginate, text_search
from app.schemas.customer import CustomerCreate, CustomerFilters, CustomerUpdate


def get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Cliente não encontrado", "CUSTOMER_NOT_FOUND")
    return customer


def _ensure_email_free(db: Session, email: str, exclude_id: int | None = None) -> None:
    stmt = select(Customer.id).where(Customer.email == email)
    if exclude_id is not None:
        stmt = stmt.where(Customer.id != exclude_id)
    if db.scalar(stmt):
        raise ConflictError("Já existe um cliente com esse e-mail", "EMAIL_TAKEN")


def list_customers(db: Session, f: CustomerFilters) -> dict:
    stmt = select(Customer).order_by(Customer.name.collate("und-x-icu"), Customer.id)
    if f.q and f.q.strip():
        stmt = stmt.where(text_search(f.q, Customer.name, Customer.email))
    return paginate(db, stmt, f)


def create_customer(db: Session, data: CustomerCreate) -> Customer:
    _ensure_email_free(db, data.email)
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    return customer


def update_customer(db: Session, customer_id: int, data: CustomerUpdate) -> Customer:
    customer = get_customer(db, customer_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in changes:
        _ensure_email_free(db, changes["email"], exclude_id=customer_id)
    for field, value in changes.items():
        setattr(customer, field, value)
    db.commit()
    return customer
