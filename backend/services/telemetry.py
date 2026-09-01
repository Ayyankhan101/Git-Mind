import logging
import os
import time

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from prometheus_client import REGISTRY, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware


def setup_logging() -> None:
    use_json = os.getenv("JSON_LOGS", "0") == "1"
    log_level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    shared_processors: list[structlog.types.Processor] = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    renderer = (
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *shared_processors,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            renderer,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        level=log_level,
        format="%(message)s",
        force=True,
    )


# ── Prometheus metrics ──────────────────────────────────────────────────────

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)
active_websocket_connections = Gauge(
    "active_websocket_connections",
    "Currently active WebSocket connections",
)
sessions_active = Gauge(
    "sessions_active",
    "Active in-memory sessions",
)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ("/metrics", "/health"):
            return await call_next(request)

        # Normalize path labels to prevent cardinality explosion
        normalized = _normalize_path(path)

        method = request.method
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        status = str(response.status_code)

        http_requests_total.labels(method=method, path=normalized, status=status).inc()
        http_request_duration_seconds.labels(method=method, path=normalized).observe(
            duration
        )
        return response


import re as _re  # noqa: E402

_UUID_RE = _re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", _re.IGNORECASE
)
_NUM_RE = _re.compile(r"\d{4,}")


def _normalize_path(path: str) -> str:
    """Replace UUIDs and long numeric IDs with :id for metric labels."""
    path = _UUID_RE.sub(":id", path)
    path = _NUM_RE.sub(":id", path)
    return path


def setup_metrics(app: FastAPI) -> None:
    app.add_middleware(MetricsMiddleware)

    @app.get("/metrics")
    async def metrics():
        return PlainTextResponse(
            generate_latest(REGISTRY), media_type="text/plain; version=0.0.4"
        )


def setup_tracing(_app: FastAPI) -> None:
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")

    provider = TracerProvider()
    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )

            provider.add_span_processor(
                SimpleSpanProcessor(OTLPSpanExporter(endpoint=endpoint))
            )
        except ImportError:
            provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    else:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
