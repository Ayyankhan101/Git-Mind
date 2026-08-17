"""Security response headers middleware.

Sets defense-in-depth headers on every HTTP response. HSTS is only emitted
when the request arrived over HTTPS (or via a trusted proxy, X-Forwarded-Proto)
so local http:// dev is unaffected.

CSP starts report-only: React apps use inline styles, so an enforced policy
would break rendering. Soak report-only before switching to enforcement.
"""

import os

import structlog
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)

_X_FRAME_OPTIONS = "DENY"
_X_CONTENT_TYPE_OPTIONS = "nosniff"
_REFERRER_POLICY = "strict-origin-when-cross-origin"
_PERMISSIONS_POLICY = "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()"
_CSP_REPORT_ONLY = (
    "default-src 'self'; "
    "connect-src 'self' https: ws: wss:; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' https://fonts.gstatic.com; "
    "script-src 'self'; "
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
)

_HEADERS = {
    "X-Frame-Options": _X_FRAME_OPTIONS,
    "X-Content-Type-Options": _X_CONTENT_TYPE_OPTIONS,
    "Referrer-Policy": _REFERRER_POLICY,
    "Permissions-Policy": _PERMISSIONS_POLICY,
    "Content-Security-Policy-Report-Only": _CSP_REPORT_ONLY,
}

_HSTS_HEADER = "Strict-Transport-Security"
_HSTS_VALUE = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for name, value in _HEADERS.items():
            response.headers[name] = value

        proto = request.headers.get("X-Forwarded-Proto", "")
        scheme = proto.split(",")[0].strip() if proto else request.url.scheme
        if scheme == "https":
            response.headers[_HSTS_HEADER] = _HSTS_VALUE
        elif os.getenv("ENVIRONMENT", "production") != "production":
            pass  # dev: never set HSTS on plain http
        return response
