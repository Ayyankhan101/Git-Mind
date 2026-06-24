"""GitHub App authentication helpers — JWT generation and installation token exchange."""

import os
import time

import httpx
import jwt
import structlog

logger = structlog.get_logger(__name__)


def _get_app_config() -> tuple[str, str]:
    """Return (app_id, private_key_pem) from env vars."""
    app_id = os.getenv("GITHUB_APP_ID", "")
    private_key = os.getenv("GITHUB_APP_PRIVATE_KEY", "").replace("\\n", "\n")
    return app_id, private_key


def generate_app_jwt() -> str:
    """Generate a short-lived JWT for authenticating as the GitHub App."""
    app_id, private_key = _get_app_config()
    if not app_id or not private_key:
        raise RuntimeError("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set")

    now = int(time.time())
    payload = {
        "iat": now - 60,  # backdate 60s to avoid clock skew
        "exp": now + 600,  # 10 min expiry
        "iss": app_id,
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


async def get_installation_token(installation_id: int | None = None) -> str:
    """Exchange the app JWT for an installation access token."""
    inst_id = installation_id or int(os.getenv("GITHUB_APP_INSTALLATION_ID", "0"))
    if not inst_id:
        raise RuntimeError("GITHUB_APP_INSTALLATION_ID must be set")

    app_jwt = generate_app_jwt()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://api.github.com/app/installations/{inst_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        token = data["token"]
        logger.info("GitHub App installation token acquired", installation_id=inst_id)
        return token


async def post_comment(owner: str, repo: str, issue_number: int, body: str) -> dict:
    """Post a comment on a PR/issue using the installation token."""
    token = await get_installation_token()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            },
            json={"body": body},
        )
        resp.raise_for_status()
        return resp.json()
