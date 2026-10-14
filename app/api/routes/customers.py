from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.schemas.common import Page, error_responses
from app.schemas.customer import CustomerCreate, CustomerFilters, CustomerOut, CustomerUpdate
from app.services import customers

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=Page[CustomerOut])
def list_customers(db: DbSession, filters: Annotated[CustomerFilters, Query()]):
    return customers.list_customers(db, filters)


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED, responses=error_responses(409))
def create_customer(db: DbSession, data: CustomerCreate):
    return customers.create_customer(db, data)


@router.get("/{customer_id}", response_model=CustomerOut, responses=error_responses(404))
def get_customer(db: DbSession, customer_id: int):
    return customers.get_customer(db, customer_id)


@router.patch("/{customer_id}", response_model=CustomerOut, responses=error_responses(404, 409))
def update_customer(db: DbSession, customer_id: int, data: CustomerUpdate):
    return customers.update_customer(db, customer_id, data)
