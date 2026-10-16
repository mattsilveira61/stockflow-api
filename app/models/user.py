from enum import StrEnum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import TimestampMixin, enum_check


class Role(StrEnum):
    ADMIN = "ADMIN"  # tudo, inclusive catálogo e usuários
    OPERADOR = "OPERADOR"  # operação do dia a dia: pedidos, movimentações, compras, clientes e fornecedores
    LEITOR = "LEITOR"  # só consulta


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (enum_check("role", Role, "role_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
