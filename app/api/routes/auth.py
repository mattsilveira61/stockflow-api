from fastapi import APIRouter, Request

from app.api.deps import CurrentUser, DbSession
from app.core.errors import TooManyRequestsError, UnauthorizedError
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token
from app.schemas.common import error_responses
from app.schemas.user import LoginRequest, TokenOut, UserOut
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut, responses=error_responses(401, 403, 429))
def login(db: DbSession, data: LoginRequest, request: Request):
    """Troca e-mail e senha por um token. Envie-o em `Authorization: Bearer <token>` (no Swagger: **Authorize**).

    Depois de 5 senhas erradas em 1 minuto para o mesmo e-mail e IP, responde 429 com `Retry-After`.
    """
    ip = request.client.host if request.client else "?"
    wait = login_limiter.retry_after(ip, data.email)
    if wait:
        raise TooManyRequestsError(f"Muitas tentativas. Tente de novo em {wait} segundos", wait)
    try:
        user = users.authenticate(db, data.email, data.password)
    except UnauthorizedError:
        login_limiter.fail(ip, data.email)
        raise
    login_limiter.reset(ip, data.email)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, responses=error_responses(401))
def me(user: CurrentUser):
    """Dados do usuário dono do token (o painel usa para saber o perfil)."""
    return user
