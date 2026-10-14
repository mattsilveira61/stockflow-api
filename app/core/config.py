from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# O .env fica na raiz do repositório, compartilhado com o compose.
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None
    # Chave exigida no cabeçalho X-API-Key para criar e alterar dados (consultas são livres).
    api_key: str = Field(min_length=16)


@lru_cache
def get_settings() -> Settings:
    return Settings()
