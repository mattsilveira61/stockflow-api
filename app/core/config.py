from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# O .env fica na raiz do repositório, compartilhado com o compose.
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None
    # Assina os tokens de login. Gere uma: python -c "import secrets;print(secrets.token_urlsafe(48))"
    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 480
    # Senha dos usuários de demonstração criados pelo seed
    demo_password: str | None = None
    # Fuso usado para "dia" em filtros e gráficos (o banco guarda tudo em UTC).
    timezone: str = "America/Sao_Paulo"

    @field_validator("database_url", "test_database_url")
    @classmethod
    def _use_psycopg(cls, url: str | None) -> str | None:
        """O Neon entrega "postgresql://..." (ou "postgres://..."); o SQLAlchemy precisa saber o driver."""
        if url and url.startswith(("postgres://", "postgresql://")):
            return "postgresql+psycopg://" + url.split("://", 1)[1]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
