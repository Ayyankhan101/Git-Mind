"""Middleware to reject requests with oversized bodies."""
import os

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = structlog.get_logger(__name__)

_MAX_BODY_BYTES = int(os.getenv("MAX_REQUEST_BODY_BYTES", str(5 * 1024 * 1024)))  # 5MB default


class BodyLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int | None = None):
        super().__init__(app)
        self.max_bytes = max_bytes if max_bytes is not None else _MAX_BODY_BYTES

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            size = int(content_length)
            if size > self.max_bytes:
                logger.warning(
                    "Request body too large",
                    path=request.url.path,
                    size=size,
                    limit=self.max_bytes,
                )
                return JSONResponse(
                    status_code=413,
                    content={"error": f"Request body too large — max {self.max_bytes} bytes"},
                )
        return await call_next(request)
