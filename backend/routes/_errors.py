"""Shared error response + validation helpers for all routes."""

import re
import uuid

from fastapi.responses import JSONResponse


def error_response(
    message: str, status_code: int = 400, request_id: str | None = None
) -> JSONResponse:
    """Return a standardized JSON error response with the given HTTP status code."""
    rid = request_id or str(uuid.uuid4())[:8]
    return JSONResponse(
        status_code=status_code, content={"error": message, "request_id": rid}
    )


_GH_URL_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?$")
_REPO_URL_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+?)(?:\.git)?/?$"
)
_PR_URL_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)/pull/(\d+)/?$"
)


def is_valid_gh_url(url: str) -> bool:
    """True if url is a plain GitHub repo URL (owner/repo)."""
    return bool(_GH_URL_RE.match(url))


def match_gh_repo_url(url: str) -> re.Match | None:
    """Match a GitHub repo URL, capturing (owner, repo). Accepts optional .git suffix."""
    return _REPO_URL_RE.match(url)


def match_gh_pr_url(url: str) -> re.Match | None:
    """Match a GitHub PR URL, capturing (owner, repo, pr_number)."""
    return _PR_URL_RE.match(url)
