import asyncio
import re

import httpx
import structlog
from fastapi import APIRouter, Request

from services.auth import get_gh_token

logger = structlog.get_logger(__name__)
router = APIRouter()

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,38}$')


@router.get("/repos/{username}")
async def list_repos(username: str, request: Request):
    if not _USERNAME_RE.match(username):
        return {"error": "Invalid GitHub username"}

    token = get_gh_token(request)
    gh_headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        gh_headers["Authorization"] = f"Bearer {token}"

    if token:
        url = "https://api.github.com/user/repos"
        params = {"per_page": 100, "sort": "pushed", "visibility": "all", "affiliation": "owner"}
    else:
        url = f"https://api.github.com/users/{username}/repos"
        params = {"per_page": 100, "sort": "pushed"}

    _gh_timeout = httpx.Timeout(connect=8.0, read=20.0, write=5.0, pool=5.0)
    resp = None
    last_exc = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=_gh_timeout) as client:
                resp = await client.get(url, params=params, headers=gh_headers)
            break
        except httpx.TimeoutException as exc:
            last_exc = exc
            await asyncio.sleep(0.5 * (attempt + 1))
        except httpx.RequestError as exc:
            return {"error": f"GitHub API unreachable: {exc}"}
    if resp is None:
        return {"error": "GitHub API timed out — try again in a moment"}

    if resp.status_code == 401:
        return {"error": "GitHub token is invalid or expired"}
    if resp.status_code == 404:
        return {"error": f"GitHub user '{username}' not found"}
    if resp.is_error:
        return {"error": f"GitHub API error {resp.status_code}"}

    repos = [
        {
            "name": r["name"],
            "full_name": r["full_name"],
            "description": r.get("description") or "",
            "language": r.get("language") or "",
            "stars": r["stargazers_count"],
            "url": r["html_url"],
            "fork": r["fork"],
            "private": r["private"],
            "pushed_at": r.get("pushed_at") or r["updated_at"],
            "updated_at": r["updated_at"],
        }
        for r in resp.json()
        if token or not r["private"]
    ]
    logger.info("Listed repos", count=len(repos), user=username, auth=bool(token))
    return {"repos": repos, "username": username}
