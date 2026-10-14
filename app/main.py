from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.routes import categories, health, products
from app.core.errors import AppError

app = FastAPI(
    title="StockFlow API",
    description="API de gestão de estoque e pedidos.",
    version="0.1.0",
)


def error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": jsonable_encoder(body)})


@app.exception_handler(AppError)
def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Converte os erros de regra de negócio dos services em respostas HTTP."""
    return error_response(exc.status_code, exc.code, exc.message)


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
