import hashlib
import os
import re

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

_GH_TOKEN_RE = re.compile(r"^(gh[pousr]_|github_pat_)[A-Za-z0-9_]+$")

_PUBLIC_PATHS = frozenset({"/health", "/metrics", "/docs", "/openapi.json"})


def get_gh_token(request) -> str | None:
    token = (request.headers.get("X-GH-Token") or "").strip()
    if token:
        return token
    return os.getenv("GITHUB_TOKEN") or None


def require_gh_token(request) -> str:
    token = (request.headers.get("X-GH-Token") or "").strip() or os.getenv("GITHUB_TOKEN")
    if not token:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=401,
            detail="GitHub token required — send X-GH-Token header or set GITHUB_TOKEN",
        )
    return token


def require_gh_token_or_service_key(request) -> str | None:
    """Require a valid GitHub PAT or service key. Returns token or raises 401."""
    from fastapi import HTTPException

    token = (request.headers.get("X-GH-Token") or "").strip() or os.getenv("GITHUB_TOKEN")
    service_key = (request.headers.get("X-Service-Key") or "").strip() or os.getenv("GITMIND_SERVICE_KEY")
    if token:
        return token
    if service_key:
        return None  # service key accepted, no token needed
    raise HTTPException(status_code=401, detail="Authentication required — send X-GH-Token header or X-Service-Key")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_service_key(request) -> str | None:
    return (request.headers.get("X-Service-Key") or "").strip() or os.getenv("GITMIND_SERVICE_KEY")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _PUBLIC_PATHS or path.startswith("/ws/"):
            return await call_next(request)
        token = request.headers.get("X-GH-Token", "").strip() or os.getenv("GITHUB_TOKEN", "")
        request.state.gh_token = token or None
        return await call_next(request)
