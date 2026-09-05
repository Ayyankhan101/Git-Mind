import hashlib
import hmac
import os
import re
import time
from typing import NoReturn

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_GH_TOKEN_RE = re.compile(r"^(gh[pousr]_|github_pat_)[A-Za-z0-9_]+$")


def _is_valid_service_key(service_key: str) -> bool:
    """Constant-time check against the real server secret.

    A service key header is only meaningful if it matches
    GITMIND_SERVICE_KEY — an unset server secret must never match an
    empty/arbitrary caller-supplied value.
    """
    real_key = os.environ.get("GITMIND_SERVICE_KEY", "")
    return bool(real_key) and hmac.compare_digest(service_key, real_key)


def mint_ws_ticket() -> str | None:
    """Short-lived signed ticket for the /ws/analyze handshake.

    Replaces a static shared secret that used to be hardcoded in the public
    frontend bundle — anyone reading the JS source got a value that never
    expired and worked from any client. This ticket is `{ts}.{hmac}`, only
    valid for 5 minutes, and the server secret (WS_AUTH_SECRET) never leaves
    the backend. Returns None when WS_AUTH_SECRET isn't configured (dev mode,
    where the ws handler already accepts unauthenticated connections).
    """
    secret = os.environ.get("WS_AUTH_SECRET")
    if not secret:
        return None
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return f"{ts}.{sig}"


def verify_ws_ticket(ticket: str) -> bool:
    secret = os.environ.get("WS_AUTH_SECRET")
    if not secret or not ticket or "." not in ticket:
        return False
    ts_raw, _, sig = ticket.partition(".")
    expected = hmac.new(secret.encode(), ts_raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        return abs(time.time() - int(ts_raw)) <= 300
    except ValueError:
        return False


# ── Public paths — no auth required ─────────────────────────────────────────
# These are intentionally open: health checks, docs, and OpenAPI spec.
# /analysis/* are public because they only read session data (no GitHub access).
# /ws-ticket is public because it only hands out a 5-minute-lived anti-abuse
# ticket, not a real credential — the WS handler still needs it to connect.
# WebSocket auth is enforced inside the ws handlers (see ws/analyze.py, ws/crisis.py).
_PUBLIC_PATHS = frozenset(
    {
        "/health",
        "/docs",
        "/openapi.json",
        "/metrics",
        "/summary",
        "/fix",
        "/chat",
        "/chat/stream",
        "/incident-report",
        "/ws-ticket",
    }
)
_PUBLIC_PATH_PREFIXES = ("/repos", "/analysis/", "/proxy", "/pr-list", "/monitor/status", "/auth/github")

# Webhook paths — HMAC-verified inside the route handler, not by this middleware.
_WEBHOOK_PATH_PREFIXES = ("/github/webhook",)

# Known route prefixes — paths NOT matching these are unknown and should get
# a proper 404 from FastAPI rather than a 401 from this middleware.
_KNOWN_ROUTE_PREFIXES = (
    "/health",
    "/docs",
    "/openapi.json",
    "/metrics",
    "/summary",
    "/fix",
    "/chat",
    "/incident-report",
    "/repos",
    "/analysis",
    "/pr",
    "/org",
    "/github",
    "/webhook",
    "/monitor",
    "/proxy",
    "/auth",
)


def _is_public(path: str) -> bool:
    if path in _PUBLIC_PATHS:
        return True
    if any(path.startswith(prefix) for prefix in _PUBLIC_PATH_PREFIXES):
        return True
    return any(path.startswith(prefix) for prefix in _WEBHOOK_PATH_PREFIXES)


def _is_known_route(path: str) -> bool:
    """Check if path matches any registered route prefix."""
    return any(path.startswith(prefix) for prefix in _KNOWN_ROUTE_PREFIXES)


def _extract_token(request: Request) -> str | None:
    """Extract GitHub token from Authorization header or X-GH-Token header."""
    # Standard Bearer token
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    # Legacy custom header (backward compat)
    token = (request.headers.get("x-gh-token") or "").strip()
    if token:
        return token
    return None


def _auth_error(detail: str) -> NoReturn:
    raise HTTPException(status_code=401, detail=detail)


def get_gh_token(request) -> str | None:
    """Caller identity. Headers only — never the server's own PAT.

    Used for authorization and for deriving owner_hash, so falling back to
    GITHUB_TOKEN here would authenticate every anonymous caller as the server
    and collapse them into one shared owner bucket. For talking *to* GitHub,
    use get_github_credential instead.
    """
    return _extract_token(request)


def get_github_credential(request) -> str | None:
    """Credential for outbound GitHub API calls.

    Prefers the caller's token; falls back to the server PAT so anonymous
    public-repo reads keep the 5000 req/hr limit instead of 60. Never use this
    to decide who the caller is.
    """
    return _extract_token(request) or os.getenv("GITHUB_TOKEN") or None


def require_gh_token(request) -> str:
    token = _extract_token(request)
    if not token:
        _auth_error("GitHub token required — send Authorization: Bearer <token> header")
    return token  # type: ignore[return-value]


def require_gh_token_or_service_key(request) -> str | None:
    """Require a caller-supplied GitHub PAT or a valid service key. Returns token or raises 401."""
    token = _extract_token(request)
    service_key = (request.headers.get("X-Service-Key") or "").strip()
    if token:
        return token
    if service_key and _is_valid_service_key(service_key):
        return None  # valid service key, no token needed
    _auth_error("Authentication required — send Authorization: Bearer <token> or a valid X-Service-Key")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_service_key(request) -> str | None:
    """Caller-supplied service key. Headers only — the server's own key is not
    a caller credential, and returning it here would hand every anonymous
    request the rate-limit bypass in services.rate_limiter._is_service_key."""
    return (request.headers.get("X-Service-Key") or "").strip() or None


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware-level default-deny authentication.

    All non-public paths require a valid GitHub token or service key.
    Public paths (/health, /docs, /openapi.json, /metrics) and webhook paths
    (HMAC-verified in-route) are exempt.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if _is_public(path):
            return await call_next(request)

        # Let unknown paths through — FastAPI will return 404, not our middleware 401.
        if not _is_known_route(path):
            return await call_next(request)

        token = _extract_token(request)
        service_key = (request.headers.get("X-Service-Key") or "").strip()

        if not token and not _is_valid_service_key(service_key):
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Authentication required — send Authorization: Bearer <token> or a valid X-Service-Key",
                },
            )

        request.state.gh_token = token
        request.state.service_key = service_key
        return await call_next(request)
