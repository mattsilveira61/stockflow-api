from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.models import Role
from app.schemas.common import InputModel
from app.schemas.customer import Email

UserName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


def _fits_bcrypt(value: str) -> str:
    # O bcrypt só usa os primeiros 72 bytes (letras com acento ocupam 2)
    if len(value.encode()) > 72:
        raise ValueError("A senha pode ter no máximo 72 bytes")
    return value


Password = Annotated[str, Field(min_length=8), AfterValidator(_fits_bcrypt)]


class LoginRequest(InputModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=200)]


class UserOut(BaseModel):
    """Nunca inclui a senha nem o hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(InputModel):
    name: UserName
    email: Email
    password: Password
    role: Role


class UserUpdate(InputModel):
    """Só os campos enviados mudam. `is_active: false` desativa (não há exclusão)."""

    name: UserName | None = None
    email: Email | None = None
    password: Password | None = None
    role: Role | None = None
    is_active: bool | None = None
