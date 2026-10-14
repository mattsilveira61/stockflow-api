import logging

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.deps import require_api_key_for_writes
from app.api.routes import categories, customers, health, orders, products, reports
from app.core.errors import AppError, UnauthorizedError

logger = logging.getLogger("stockflow")

DESCRIPTION = """
API REST de estoque e pedidos com foco em integridade dos dados.

- O saldo só muda por **movimentações** ou **pedidos**, e cada mudança fica no histórico.
- Pedidos e cancelamentos são **atômicos**: tudo muda junto ou nada muda.
- Venda simultânea das últimas unidades é segura (lock de linha no PostgreSQL).
- `Idempotency-Key` no `POST /orders` evita pedido duplicado em reenvios.

**Consultas são livres. Para `POST` e `PATCH`, clique em _Authorize_ e informe a `X-API-Key`.**
"""

app = FastAPI(
    title="StockFlow API",
    description=DESCRIPTION,
    version="1.0.0",
    dependencies=[Depends(require_api_key_for_writes)],
)


@app.middleware("http")
async def unexpected_error_handler(request: Request, call_next):
    """Qualquer erro não previsto vira um 500 genérico; o detalhe vai só para o log."""
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Erro inesperado em %s %s", request.method, request.url.path)
        return error_response(500, "INTERNAL_ERROR", "Erro interno no servidor. Tente de novo mais tarde.")


def error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": jsonable_encoder(body)})


@app.exception_handler(AppError)
def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Converte os erros de regra de negócio dos services em respostas HTTP."""
    response = error_response(exc.status_code, exc.code, exc.message)
    if isinstance(exc, UnauthorizedError):
        response.headers["WWW-Authenticate"] = "ApiKey"
    return response


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return error_response(422, "VALIDATION_ERROR", "Dados inválidos", details)


@app.exception_handler(IntegrityError)
def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Rede de segurança para corridas que passam pelas checagens do service (ex.: dois
    cadastros simultâneos do mesmo SKU). O detalhe do banco não vai para a resposta."""
    return error_response(409, "CONFLICT", "A operação conflita com dados existentes")


app.include_router(health.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(customers.router)
app.include_router(orders.router)
app.include_router(reports.router)
