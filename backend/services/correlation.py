"""Request correlation ID middleware.

Injects X-Request-ID into every request/response, binds to structlog context
and OpenTelemetry span for distributed trace correlation.
"""
import uuid

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class CorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        # Bind to structlog for this request's log output
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        # Add to OpenTelemetry span if available
        try:
            from opentelemetry import trace
            span = trace.get_current_span()
            if span.is_recording():
                span.set_attribute("http.request_id", request_id)
        except Exception:
            pass

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
