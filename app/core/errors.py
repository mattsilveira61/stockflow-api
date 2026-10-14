"""Erros de regra de negócio.

Os services lançam estas exceções sem saber nada de HTTP; os handlers do main.py
transformam cada uma na resposta {"error": {"code", "message"}} com o status certo.
"""


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    """A ação viola uma regra de negócio (SKU repetido, estoque insuficiente...)."""

    status_code = 409
    code = "CONFLICT"
