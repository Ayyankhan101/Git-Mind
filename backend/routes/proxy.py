"""Proxy for GitHub API — avoids browser CORS blocks."""

import re

import httpx
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import Response

from routes._errors import error_response
from services.auth import get_gh_token
from services.rate_limiter import check_rate_limit, get_client_ip

logger = structlog.get_logger(__name__)
router = APIRouter()

_GH_TIMEOUT = httpx.Timeout(connect=8.0, read=20.0, write=5.0, pool=5.0)
# Only allow safe paths — no writes
_SAFE_PATH_RE = re.compile(r"^/(repos|users|contents|pulls|issues|commits|git)/")


@router.api_route(
    "/proxy/github/{path:path}",
    methods=["GET"],
    include_in_schema=False,
)
async def proxy_github(path: str, request: Request):
    """Proxy GET requests to api.github.com to avoid browser CORS."""
    if not _SAFE_PATH_RE.match(f"/{path}"):
        return error_response("Path not allowed", 403)

    client_ip = get_client_ip(request)
    allowed, remaining, _ = await check_rate_limit("proxy", client_ip)
    if not allowed:
        return Response(
            content='{"error":"Rate limit exceeded"}',
            status_code=429,
            media_type="application/json",
        )

    token = get_gh_token(request)
    gh_headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitMind",
    }
    if token:
        gh_headers["Authorization"] = f"Bearer {token}"

    url = f"https://api.github.com/{path}"
    # Forward query string
    qs = str(request.query_params)
    if qs:
        url += f"?{qs}"

    try:
        async with httpx.AsyncClient(timeout=_GH_TIMEOUT) as client:
            resp = await client.get(url, headers=gh_headers)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
                headers={"X-RateLimit-Remaining": str(remaining)},
            )
    except httpx.TimeoutException:
        return error_response("GitHub API timeout", 504)
    except Exception as exc:
        logger.error("github_proxy_error", error=str(exc))
        return error_response("Proxy error", 502)
