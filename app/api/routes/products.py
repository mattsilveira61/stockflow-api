from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import ADMIN, OPERATOR, DbSession
from app.schemas.common import Page, PageParams, error_responses, write_responses
from app.schemas.product import ProductCreate, ProductFilters, ProductImportResult, ProductOut, ProductUpdate
from app.schemas.stock_movement import MovementCreate, MovementOut
from app.services import catalog, csv_io, inventory

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=Page[ProductOut])
def list_products(db: DbSession, filters: Annotated[ProductFilters, Query()]):
    return catalog.list_products(db, filters)


@router.get("/export.csv", response_class=StreamingResponse)
def export_products(db: DbSession, filters: Annotated[ProductFilters, Query()]):
    """Planilha CSV (separador `;`, abre direto no Excel) com os mesmos filtros da listagem, sem paginação."""
    return StreamingResponse(
        csv_io.export_products(db, filters),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="produtos.csv"'},
    )


@router.post("/import", dependencies=ADMIN, response_model=ProductImportResult, responses=write_responses(422))
def import_products(
    db: DbSession,
    file: Annotated[UploadFile, File(description="Planilha CSV de produtos")],
    dry_run: Annotated[bool, Query(description="Só confere o arquivo e mostra o que mudaria, sem gravar")] = False,
):
    """Cria os SKUs novos e atualiza os existentes, tudo numa transação.

    Com qualquer linha inválida nada é gravado, e a resposta (422) lista cada problema com linha e coluna.
    A coluna `estoque` é ignorada: o saldo só muda por movimentações. Até 1 MB e 1000 linhas.
    """
    return csv_io.import_products(db, file.file.read(csv_io.MAX_IMPORT_BYTES + 1), dry_run=dry_run)


@router.post(
    "",
    dependencies=ADMIN,
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    responses=write_responses(404, 409),
)
def create_product(db: DbSession, data: ProductCreate):
    """O produto nasce com saldo 0; o estoque entra por `POST /products/{id}/movements`."""
    return catalog.create_product(db, data)


@router.get("/{product_id}", response_model=ProductOut, responses=error_responses(404))
def get_product(db: DbSession, product_id: int):
    return catalog.get_product(db, product_id)


@router.patch("/{product_id}", dependencies=ADMIN, response_model=ProductOut, responses=write_responses(404, 409))
def update_product(db: DbSession, product_id: int, data: ProductUpdate):
    """Altera os dados cadastrais ou desativa (`is_active: false`). O saldo não pode ser alterado aqui."""
    return catalog.update_product(db, product_id, data)


@router.post(
    "/{product_id}/movements",
    dependencies=OPERATOR,
    response_model=MovementOut,
    status_code=status.HTTP_201_CREATED,
    responses=write_responses(404, 409),
)
def create_movement(db: DbSession, product_id: int, data: MovementCreate):
    """Entrada (`IN`) ou saída (`OUT`) manual. Uma saída maior que o saldo é recusada (409)."""
    return inventory.register_manual_movement(db, product_id, data)


@router.get("/{product_id}/movements", response_model=Page[MovementOut], responses=error_responses(404))
def list_movements(db: DbSession, product_id: int, params: Annotated[PageParams, Query()]):
    """Histórico do produto, do mais recente para o mais antigo."""
    return inventory.list_movements(db, product_id, params)
