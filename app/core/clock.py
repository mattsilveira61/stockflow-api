"""Datas no fuso da loja. O banco guarda tudo em UTC; "dia" para filtros e gráficos é o dia local."""

from datetime import date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

from sqlalchemy import bindparam, func

from app.core.config import get_settings


@lru_cache
def company_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def now() -> datetime:
    return datetime.now(company_tz())


def today() -> date:
    return now().date()


def start_of_day(day: date) -> datetime:
    """Meia-noite local do dia, com fuso (comparável com as colunas timestamptz)."""
    return datetime.combine(day, time.min, company_tz())


def end_of_day_exclusive(day: date) -> datetime:
    return start_of_day(day + timedelta(days=1))


def local_date(column):
    """Expressão SQL com o dia local de uma coluna timestamptz.

    O fuso vai literal no SQL (literal_execute): como parâmetro normal, o Postgres não
    reconhece que a expressão do SELECT é a mesma do GROUP BY.
    """
    tz = bindparam("tz", get_settings().timezone, literal_execute=True)
    return func.date(func.timezone(tz, column))
