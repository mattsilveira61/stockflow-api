from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models import Role, User
from app.schemas.user import UserCreate, UserUpdate


@lru_cache
def _dummy_hash() -> str:
    return hash_password("senha-que-nao-existe")


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    # Confere a senha mesmo quando o e-mail não existe: a resposta demora o mesmo tempo nos dois
    # casos e não revela quais e-mails estão cadastrados.
    password_ok = verify_password(password, user.password_hash if user else _dummy_hash())
    if user is None or not password_ok:
        raise UnauthorizedError("E-mail ou senha inválidos", "INVALID_CREDENTIALS")
    if not user.is_active:
        raise ForbiddenError("Usuário desativado. Procure o administrador", "USER_INACTIVE")
    return user


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.name.collate("und-x-icu"), User.id)))


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Usuário não encontrado", "USER_NOT_FOUND")
    return user


def _ensure_email_free(db: Session, email: str, exclude_id: int | None = None) -> None:
    stmt = select(User.id).where(User.email == email)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    if db.scalar(stmt):
        raise ConflictError("Já existe um usuário com esse e-mail", "EMAIL_TAKEN")


def create_user(db: Session, data: UserCreate) -> User:
    _ensure_email_free(db, data.email)
    user = User(name=data.name, email=data.email, role=data.role, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return user


def update_user(db: Session, user_id: int, data: UserUpdate, actor: User) -> User:
    user = get_user(db, user_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    # O admin não pode se trancar para fora do sistema
    if user.id == actor.id:
        if changes.get("is_active") is False:
            raise ConflictError("Você não pode desativar o próprio usuário", "CANNOT_CHANGE_SELF")
        if changes.get("role", Role.ADMIN) != Role.ADMIN:
            raise ConflictError("Você não pode tirar o próprio perfil de administrador", "CANNOT_CHANGE_SELF")
    if "email" in changes:
        _ensure_email_free(db, changes["email"], exclude_id=user.id)
    if "password" in changes:
        changes["password_hash"] = hash_password(changes.pop("password"))
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    return user
