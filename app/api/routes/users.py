from fastapi import APIRouter, status

from app.api.deps import ADMIN, CurrentUser, DbSession
from app.schemas.common import error_responses, write_responses
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import users

# Gerenciar usuários é só do admin, inclusive a consulta
router = APIRouter(prefix="/users", tags=["users"], dependencies=ADMIN, responses=error_responses(401, 403))


@router.get("", response_model=list[UserOut])
def list_users(db: DbSession):
    return users.list_users(db)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED, responses=write_responses(409))
def create_user(db: DbSession, data: UserCreate):
    return users.create_user(db, data)


@router.get("/{user_id}", response_model=UserOut, responses=error_responses(404))
def get_user(db: DbSession, user_id: int):
    return users.get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserOut, responses=write_responses(404, 409))
def update_user(db: DbSession, user_id: int, data: UserUpdate, actor: CurrentUser):
    """Só os campos enviados mudam. `is_active: false` desativa; o admin não pode desativar a si mesmo."""
    return users.update_user(db, user_id, data, actor)
