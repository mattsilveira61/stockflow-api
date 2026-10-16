from math import ceil
from typing import Annotated, Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, ConfigDict, StringConstraints, computed_field
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session

T = TypeVar("T")

# Texto obrigatório: tira espaços das pontas e não aceita vazio.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class InputModel(BaseModel):
    """Base dos schemas de entrada: campo desconhecido (ex.: stock_quantity) vira 422."""

    model_config = ConfigDict(extra="forbid")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[Any] | None = None


class ErrorOut(BaseModel):
    error: ErrorBody


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int

    @computed_field
    @property
    def pages(self) -> int:
        return ceil(self.total / self.page_size)


class PageParams(BaseModel):
    page: int = Query(1, ge=1)
    page_size: int = Query(20, ge=1, le=100)


def paginate(db: Session, stmt: Select, params: PageParams) -> dict:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    items = db.scalars(stmt.limit(params.page_size).offset((params.page - 1) * params.page_size)).all()
    return {"items": items, "total": total, "page": params.page, "page_size": params.page_size}


def order_by_param(sort: str, allowed: dict[str, Any]) -> list[Any]:
    """`sort=name` ou `sort=-unit_price`; o id entra como desempate para a paginação ser estável."""
    desc = sort.startswith("-")
    column = allowed[sort.lstrip("-")]
    return [column.desc() if desc else column.asc(), allowed["id"].asc()]


def like_pattern(text: str) -> str:
    """Busca parcial sem deixar o usuário injetar curingas do LIKE."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def text_search(term: str, *columns) -> ColumnElement[bool]:
    """Busca parcial que ignora maiúsculas e acentos ("feijao" encontra "Feijão")."""
    pattern = func.unaccent(like_pattern(term.strip()))
    return or_(*(func.unaccent(column).ilike(pattern) for column in columns))


_ERROR_DESCRIPTIONS = {
    401: "X-API-Key ausente ou inválida",
    404: "Recurso não encontrado",
    409: "Regra de negócio violada",
    422: "Dados inválidos (detalhes por campo ou por linha em `details`)",
}


def error_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    """Documenta no Swagger os erros que uma rota pode devolver (rotas de escrita também podem dar 401)."""
    return {code: {"model": ErrorOut, "description": _ERROR_DESCRIPTIONS[code]} for code in codes}


def write_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    return error_responses(401, *codes)
