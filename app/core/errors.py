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


class ForbiddenError(AppError):
    """Logado, mas o perfil não pode fazer isso."""

    status_code = 403
    code = "FORBIDDEN"


class TooManyRequestsError(AppError):
    """Tentativas demais em pouco tempo; retry_after diz quantos segundos esperar."""

    status_code = 429
    code = "TOO_MANY_REQUESTS"

    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after
