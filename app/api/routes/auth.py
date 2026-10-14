from fastapi import APIRouter, status

from app.schemas.common import write_responses

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT, responses=write_responses())
def verify_api_key():
    """Confere a `X-API-Key` sem alterar nada (o painel usa no "Entrar"). 204 = chave válida."""
