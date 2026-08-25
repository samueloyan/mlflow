from __future__ import annotations

from typing import Any


class TensorlaneError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class AuthenticationError(TensorlaneError):
    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__("UNAUTHENTICATED", message, 401)


class AuthorizationError(TensorlaneError):
    def __init__(
        self,
        code: str = "WORKSPACE_ACCESS_DENIED",
        message: str = "You do not have permission to access this workspace.",
    ) -> None:
        super().__init__(code, message, 403)


class NotFoundError(TensorlaneError):
    def __init__(self, message: str = "Resource not found.") -> None:
        super().__init__("NOT_FOUND", message, 404)


class ConflictError(TensorlaneError):
    def __init__(self, message: str, code: str = "CONFLICT") -> None:
        super().__init__(code, message, 409)


class LimitExceededError(TensorlaneError):
    def __init__(self, message: str, metric: str) -> None:
        super().__init__(
            "LIMIT_EXCEEDED",
            message,
            402,
            details={"metric": metric},
        )


class RateLimitedError(TensorlaneError):
    def __init__(self, message: str = "Rate limit exceeded. Retry shortly.") -> None:
        super().__init__("RATE_LIMITED", message, 429)


def error_body(exc: TensorlaneError, request_id: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "request_id": request_id,
        }
    }
    if exc.details:
        payload["error"]["details"] = exc.details
    return payload
