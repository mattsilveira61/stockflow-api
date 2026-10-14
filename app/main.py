from fastapi import FastAPI

from app.api.routes import health

app = FastAPI(
    title="StockFlow API",
    description="API de gestão de estoque e pedidos.",
    version="0.1.0",
)

app.include_router(health.router)
