"""Auth identity tests.

The server's own credentials (GITHUB_TOKEN, GITMIND_SERVICE_KEY) exist so the
backend can talk to GitHub with a raised rate limit. They must never be
accepted as proof of *caller* identity — otherwise every anonymous request is
authenticated as the server, shares the server's PAT scope, and (via
hash_token) collapses into a single owner_hash bucket that any caller can read
and delete.

Identity comes from request headers only. Outbound GitHub credentials may fall
back to the server PAT.
"""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from services import auth


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": raw,
            "client": ("testclient", 123),
        }
    )


@pytest.fixture(autouse=True)
def server_creds(monkeypatch):
    """Simulate production: the Space has both server credentials set."""
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_pat_placeholder")
    monkeypatch.setenv("GITMIND_SERVICE_KEY", "svc_server_key_placeholder")


# ── Identity must come from headers only ────────────────────────────────────


def test_get_gh_token_returns_none_without_header():
    assert auth.get_gh_token(_request()) is None


def test_get_gh_token_reads_bearer_header():
    req = _request({"Authorization": "Bearer ghp_caller"})
    assert auth.get_gh_token(req) == "ghp_caller"


def test_require_gh_token_rejects_request_without_header():
    with pytest.raises(HTTPException) as exc:
        auth.require_gh_token(_request())
    assert exc.value.status_code == 401


def test_require_gh_token_or_service_key_rejects_request_without_header():
    with pytest.raises(HTTPException) as exc:
        auth.require_gh_token_or_service_key(_request())
    assert exc.value.status_code == 401


def test_require_gh_token_or_service_key_rejects_wrong_service_key():
    """A non-empty but incorrect X-Service-Key must not be accepted.

    Regression: this used to accept ANY non-empty header value as a valid
    service key, bypassing the >24h-snapshot auth gate on /analysis/{id},
    /analysis/previous, /task/{id}, and /webhook/notify.
    """
    req = _request({"X-Service-Key": "not-the-real-key"})
    with pytest.raises(HTTPException) as exc:
        auth.require_gh_token_or_service_key(req)
    assert exc.value.status_code == 401


def test_require_gh_token_or_service_key_accepts_correct_service_key():
    req = _request({"X-Service-Key": "svc_server_key_placeholder"})
    assert auth.require_gh_token_or_service_key(req) is None


def test_get_service_key_returns_none_without_header():
    assert auth.get_service_key(_request()) is None


def test_get_service_key_reads_header():
    req = _request({"X-Service-Key": "svc_caller"})
    assert auth.get_service_key(req) == "svc_caller"


# ── Outbound GitHub credential may use the server PAT ───────────────────────


def test_github_credential_falls_back_to_server_pat():
    """Public-repo reads keep the 5000 req/hr limit for anonymous callers."""
    assert auth.get_github_credential(_request()) == "ghp_server_pat_placeholder"


def test_github_credential_prefers_caller_token():
    req = _request({"Authorization": "Bearer ghp_caller"})
    assert auth.get_github_credential(req) == "ghp_caller"


# ── Middleware gate ─────────────────────────────────────────────────────────


def test_protected_route_rejects_unauthenticated_request(client):
    """/org-audit is protected — anonymous access should get 401."""
    assert client.post("/org-audit").status_code == 401


def test_protected_route_accepts_caller_token(client):
    res = client.get("/monitor/status", headers={"Authorization": "Bearer ghp_caller"})
    assert res.status_code == 200


def test_public_route_still_open(client):
    assert client.get("/health").status_code == 200


# ── WS ticket — replaces a static secret hardcoded in the frontend bundle ───


def test_mint_ws_ticket_returns_none_without_secret(monkeypatch):
    monkeypatch.delenv("WS_AUTH_SECRET", raising=False)
    assert auth.mint_ws_ticket() is None


def test_mint_and_verify_ws_ticket_round_trips(monkeypatch):
    monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
    ticket = auth.mint_ws_ticket()
    assert ticket is not None
    assert auth.verify_ws_ticket(ticket) is True


def test_verify_ws_ticket_rejects_wrong_secret(monkeypatch):
    monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
    ticket = auth.mint_ws_ticket()
    monkeypatch.setenv("WS_AUTH_SECRET", "a-different-secret")
    assert auth.verify_ws_ticket(ticket) is False


def test_verify_ws_ticket_rejects_expired_ticket(monkeypatch):
    import hashlib
    import hmac as hmac_mod

    monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
    stale_ts = str(int(auth.time.time()) - 301)
    stale_sig = hmac_mod.new(b"ws-secret-placeholder", stale_ts.encode(), hashlib.sha256).hexdigest()
    assert auth.verify_ws_ticket(f"{stale_ts}.{stale_sig}") is False


def test_verify_ws_ticket_rejects_malformed_ticket(monkeypatch):
    monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
    assert auth.verify_ws_ticket("") is False
    assert auth.verify_ws_ticket("not-a-valid-ticket") is False
