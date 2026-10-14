from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def enum_check(column: str, enum: type[StrEnum], name: str) -> CheckConstraint:
    """Enums viram VARCHAR + CHECK: mais simples de evoluir em migrações que o ENUM nativo."""
    values = ", ".join(f"'{e.value}'" for e in enum)
    return CheckConstraint(f"{column} IN ({values})", name=name)
