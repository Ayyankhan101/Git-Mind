"""Shared error response helpers for all routes."""

import uuid

from fastapi.responses import JSONResponse


def error_response(message: str, status_code: int = 400, request_id: str | None = None) -> JSONResponse:
    """Return a standardized JSON error response with the given HTTP status code."""
    rid = request_id or str(uuid.uuid4())[:8]
    return JSONResponse(status_code=status_code, content={"error": message, "request_id": rid})
