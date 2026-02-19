"""
Custom exceptions and global exception handlers.

Register these handlers in main.py via register_exception_handlers(app).
"""

import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("creature_archive")


class AppException(Exception):
    """Base exception for application errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found.", status_code=404)


class ConflictException(AppException):
    def __init__(self, message: str = "Resource already exists."):
        super().__init__(message, status_code=409)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Access denied."):
        super().__init__(message, status_code=403)


class BadRequestException(AppException):
    def __init__(self, message: str = "Bad request."):
        super().__init__(message, status_code=400)


class TooManyRequestsException(AppException):
    def __init__(self, message: str = "Too many requests."):
        super().__init__(message, status_code=429)


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )

    @app.exception_handler(PermissionError)
    async def permission_error_handler(request: Request, exc: PermissionError):
        return JSONResponse(
            status_code=403,
            content={"detail": str(exc)},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception on %s %s: %s",
            request.method,
            request.url.path,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )
