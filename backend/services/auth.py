import os
import re

_GH_TOKEN_RE = re.compile(r'^gh[pousr]_[A-Za-z0-9]{36,}$')


def get_gh_token(request) -> str | None:
    token = (request.headers.get("X-GH-Token") or "").strip()
    if token:
        return token
    return os.getenv("GITHUB_TOKEN") or None


def require_gh_token(request) -> str:
    token = (request.headers.get("X-GH-Token") or "").strip() or os.getenv("GITHUB_TOKEN")
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="GitHub token required — send X-GH-Token header or set GITHUB_TOKEN")
    return token
