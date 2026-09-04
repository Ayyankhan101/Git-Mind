"""GitHub OAuth sign-in — a second way to get the same kind of token the
manual "paste your PAT" flow already produces. No accounts, no server-side
session, no persistence: the token is handed to the frontend exactly once,
via a short-lived single-use Redis handoff code, then this module forgets it.

Inert (503 on /auth/github/login) until GITHUB_OAUTH_CLIENT_ID/SECRET are
set. Requires Redis — checked up front so a misconfigured deployment fails
before sending anyone to GitHub's consent screen, not after. The manual PAT
flow is unaffected either way.

Do not confuse GITHUB_OAUTH_CLIENT_ID/SECRET with the separate GITHUB_APP_*
credentials in services/github_app.py — a GitHub OAuth App (this module,
authorization-code flow for a user-to-server token) and a GitHub App (JWT +
installation tokens, used there for webhook flows) are different credential
types registered on different GitHub settings pages.
"""

import hashlib
import hmac
import json
import os
import secrets
import time

import httpx
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from models.requests import GithubOAuthExchangeRequest
from routes._errors import error_response
from services.cache import get_redis
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip

logger = structlog.get_logger(__name__)
router = APIRouter()

_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"
_USER_URL = "https://api.github.com/user"
_SCOPE = "repo"  # classic OAuth Apps have no read-only-private scope; matches
# what a manually-pasted PAT already needs for full feature parity (private
# repos + auto-fix PRs).

_STATE_TTL = 600  # seconds to complete GitHub's consent screen
_HANDOFF_TTL = 90  # seconds between the callback redirect and the frontend's exchange call
_HANDOFF_PREFIX = "oauth:handoff:"

# Atomic GET+DEL — same technique services/rate_limiter.py uses for its
# sliding window, rather than relying on Redis >=6.2's GETDEL command.
_POP_LUA = """
local v = redis.call('GET', KEYS[1])
if v then redis.call('DEL', KEYS[1]) end
return v
"""


def _client_id() -> str:
    return os.environ.get("GITHUB_OAUTH_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("GITHUB_OAUTH_CLIENT_SECRET", "")


def _redirect_base() -> str:
    return os.environ.get("OAUTH_REDIRECT_BASE_URL", "https://ak001z-gitmind-backend.hf.space").rstrip("/")


def _frontend_url() -> str:
    return os.environ.get("OAUTH_FRONTEND_URL", "https://gitmind-frontend.pages.dev").rstrip("/")


def _callback_url() -> str:
    return f"{_redirect_base()}/auth/github/callback"


def _state_key() -> bytes:
    # Domain-separated sub-key — the client secret is also used, unmodified,
    # as a genuine OAuth credential elsewhere in this module; deriving a
    # distinct key for the "prove this state wasn't forged" role keeps the
    # two uses from sharing raw key material.
    return hmac.new(b"gitmind-oauth-state-v1", _client_secret().encode(), hashlib.sha256).digest()


def _sign_state() -> str:
    nonce = secrets.token_urlsafe(16)
    expires_at = str(int(time.time()) + _STATE_TTL)
    sig = hmac.new(_state_key(), f"{nonce}:{expires_at}".encode(), hashlib.sha256).hexdigest()
    return f"{nonce}:{expires_at}:{sig}"


def _verify_state(state: str) -> bool:
    try:
        nonce, expires_at, sig = state.split(":", 2)
    except ValueError:
        return False
    expected = hmac.new(_state_key(), f"{nonce}:{expires_at}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        return int(expires_at) > int(time.time())
    except ValueError:
        return False


def _error_redirect(reason: str) -> RedirectResponse:
    return RedirectResponse(f"{_frontend_url()}/?gh_oauth_error={reason}", status_code=302)


@router.get("/auth/github/login", include_in_schema=False)
async def github_login(request: Request):
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("oauth_login", client_ip))[0]:
        return await rate_limit_response("oauth_login", client_ip)

    if not _client_id() or not _client_secret():
        return error_response("GitHub OAuth is not configured on this server", 503)
    if not get_redis():
        # Fail before the consent-screen redirect, not after — Redis is a
        # hard requirement for this feature only.
        return error_response("GitHub sign-in is temporarily unavailable — paste a token instead", 503)

    params = {
        "client_id": _client_id(),
        "redirect_uri": _callback_url(),
        "scope": _SCOPE,
        "state": _sign_state(),
        "allow_signup": "false",
    }
    url = httpx.URL(_AUTHORIZE_URL, params=params)
    return RedirectResponse(str(url), status_code=302)


@router.get("/auth/github/callback", include_in_schema=False)
async def github_callback(request: Request, code: str = "", state: str = ""):
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("oauth_callback", client_ip))[0]:
        return await rate_limit_response("oauth_callback", client_ip)

    if not code or not _verify_state(state):
        return _error_redirect("invalid_state")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _TOKEN_URL,
                data={
                    "client_id": _client_id(),
                    "client_secret": _client_secret(),
                    "code": code,
                    "redirect_uri": _callback_url(),
                },
                headers={"Accept": "application/json"},
            )
        payload = resp.json()
    except Exception as exc:
        logger.warning("oauth_token_exchange_failed", error=str(exc)[:120])
        return _error_redirect("exchange_failed")

    token = payload.get("access_token")
    if not token:
        logger.warning("oauth_token_exchange_error", error=str(payload.get("error"))[:120])
        return _error_redirect("exchange_failed")

    login = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            user_resp = await client.get(
                _USER_URL, headers={"Authorization": f"Bearer {token}", "User-Agent": "GitMind"}
            )
        if user_resp.status_code == 200:
            login = user_resp.json().get("login")
    except Exception:
        pass  # best-effort only — display name, not required for the flow

    r = get_redis()
    if not r:
        # Redis died between the /login check and here — rare, but the
        # token exchange already happened, so surface it distinctly.
        return _error_redirect("unavailable")

    handoff_code = secrets.token_urlsafe(32)
    await r.set(
        f"{_HANDOFF_PREFIX}{handoff_code}",
        json.dumps({"access_token": token, "login": login}),
        ex=_HANDOFF_TTL,
    )
    return RedirectResponse(f"{_frontend_url()}/?gh_handoff={handoff_code}", status_code=302)


@router.post("/auth/github/exchange")
async def github_exchange(req: GithubOAuthExchangeRequest, request: Request):
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("oauth_exchange", client_ip))[0]:
        return await rate_limit_response("oauth_exchange", client_ip)

    r = get_redis()
    if not r:
        return error_response("GitHub OAuth is unavailable", 503)

    try:
        raw = await r.eval(_POP_LUA, 1, f"{_HANDOFF_PREFIX}{req.code}")
    except Exception as exc:
        logger.warning("oauth_handoff_pop_failed", error=str(exc)[:120])
        return error_response("GitHub sign-in failed — try again", 500)

    if not raw:
        return error_response("Invalid or expired sign-in code", 400)

    data = json.loads(raw)
    return {"access_token": data["access_token"], "login": data.get("login")}
