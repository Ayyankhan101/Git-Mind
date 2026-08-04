"""Shared error response helpers for all routes."""

from fastapi.responses import JSONResponse


def error_response(message: str, status_code: int = 400) -> JSONResponse:
    """Return a standardized JSON error response with the given HTTP status code."""
    return JSONResponse(status_code=status_code, content={"error": message})
