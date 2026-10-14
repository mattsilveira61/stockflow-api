from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr

from app.schemas.common import InputModel, Name, PageParams

# E-mail sempre em minúsculas: "Ana@Exemplo.com" e "ana@exemplo.com" são o mesmo cliente.
Email = Annotated[EmailStr, AfterValidator(str.lower)]


class CustomerCreate(InputModel):
    name: Name
    email: Email


class CustomerUpdate(InputModel):
    name: Name | None = None
    email: Email | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    created_at: datetime
    updated_at: datetime


class CustomerFilters(PageParams):
    q: str | None = None
