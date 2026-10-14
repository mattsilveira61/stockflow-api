from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Annotated[Session, Depends(get_db)]):
    """Confirma que a API está no ar e que o banco responde."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
