"""Dependências de autenticação e permissão.

Toda rota de dados exige login (JWT em `Authorization: Bearer`). O perfil decide o que cada um altera:

| Perfil   | Consulta | Pedidos, movimentações, compras, clientes, fornecedores | Catálogo e usuários |
|----------|----------|----------------------------------------------------------|---------------------|
| LEITOR   | sim      | não                                                      | não                 |
| OPERADOR | sim      | sim                                                      | não                 |
| ADMIN    | sim      | sim                                                      | sim                 |
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Role, User

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False: a resposta de erro sai no formato padrão da API, não no do FastAPI.
bearer_scheme = HTTPBearer(auto_error=False, description="Token obtido em POST /auth/login")


def get_current_user(
    db: DbSession, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]
) -> User:
    if credentials is None:
        raise UnauthorizedError("Faça login para continuar", "NOT_AUTHENTICATED")
    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id) if user_id is not None else None
    # Usuário desativado perde o acesso na hora, mesmo com o token ainda dentro da validade
    if user is None or not user.is_active:
        raise UnauthorizedError("Sessão inválida ou expirada. Faça login de novo", "INVALID_TOKEN")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], User]:
    def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError("Seu perfil não tem permissão para esta ação")
        return user

    return dependency


# Para usar em `dependencies=` de routers e rotas
LOGGED_IN = [Depends(get_current_user)]
OPERATOR = [Depends(require_roles(Role.ADMIN, Role.OPERADOR))]
ADMIN = [Depends(require_roles(Role.ADMIN))]
