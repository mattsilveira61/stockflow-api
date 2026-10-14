import secrets
from typing import Annotated

from fastapi import Depends, Request, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.db.session import get_db

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False: a resposta de erro sai no formato padrão da API, não no do FastAPI.
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="Obrigatória em POST e PATCH")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_api_key_for_writes(request: Request, api_key: Annotated[str | None, Security(api_key_header)]) -> None:
    """Consultas são públicas; qualquer escrita exige a chave. compare_digest evita ataques de tempo."""
    if request.method in SAFE_METHODS:
        return
    if not api_key or not secrets.compare_digest(api_key, get_settings().api_key):
        raise UnauthorizedError("Envie uma X-API-Key válida para alterar dados", "INVALID_API_KEY")
