# StockFlow API

[![tests](https://github.com/mattsilveira61/stockflow-api/actions/workflows/tests.yml/badge.svg)](https://github.com/mattsilveira61/stockflow-api/actions/workflows/tests.yml)

API REST para gestão de produtos, estoque, clientes e pedidos, com foco em **integridade dos dados**: o estoque nunca fica negativo (nem com pedidos simultâneos), pedidos e cancelamentos são atômicos e toda movimentação fica registrada.

**Stack:** Python 3.12 · FastAPI · PostgreSQL 16 · SQLAlchemy 2 · Alembic · pytest · Docker Compose · GitHub Actions

> Em desenvolvimento. A documentação completa (modelo de dados, decisões técnicas, exemplos) chega ao final do projeto.

## Rodando localmente

Pré-requisitos: Python 3.12 e Docker.

```powershell
copy .env.example .env
docker compose up -d postgres
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Documentação interativa: http://127.0.0.1:8000/docs

## Testes

```powershell
.\.venv\Scripts\python.exe -m pytest
```
