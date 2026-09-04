"""GitHub OAuth sign-in (routes/oauth.py) — the login/callback/exchange
handoff. No real network calls: httpx.AsyncClient.post/.get are mocked, and
Redis is a FakeRedis (get/set/eval), mirroring this repo's existing
FakeRedis-style fixtures in test_task_queue.py / test_redis_persistence.py.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import routes.oauth as oauth
from main import app

client = TestClient(app)


class FakeRedis:
    def __init__(self):
        self.kv: dict[str, str] = {}

    async def get(self, key):
        return self.kv.get(key)

    async def set(self, key, value, ex=None):
        self.kv[key] = value
        return True

    async def eval(self, _script, _numkeys, key):
        """Only ever asked to run oauth._POP_LUA in this codebase — GET+DEL."""
        value = self.kv.get(key)
        if value is not None:
            del self.kv[key]
        return value


@pytest.fixture
def fake_redis(monkeypatch):
    r = FakeRedis()
    monkeypatch.setattr(oauth, "get_redis", lambda: r)
    return r


@pytest.fixture(autouse=True)
def oauth_configured(monkeypatch):
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE_URL", "https://backend.example.com")
    monkeypatch.setenv("OAUTH_FRONTEND_URL", "https://frontend.example.com")


class FakeHTTPResponse:
    def __init__(self, json_body, status_code=200):
        self._json = json_body
        self.status_code = status_code

    def json(self):
        return self._json


class TestGithubLogin:
    def test_redirects_to_github_with_signed_state(self, fake_redis):
        resp = client.get("/auth/github/login", follow_redirects=False)
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert location.startswith("https://github.com/login/oauth/authorize")
        assert "client_id=test-client-id" in location
        assert "state=" in location
        assert "redirect_uri=https%3A%2F%2Fbackend.example.com%2Fauth%2Fgithub%2Fcallback" in location

    def test_503_when_not_configured(self, fake_redis, monkeypatch):
        monkeypatch.delenv("GITHUB_OAUTH_CLIENT_ID", raising=False)
        monkeypatch.delenv("GITHUB_OAUTH_CLIENT_SECRET", raising=False)
        resp = client.get("/auth/github/login")
        assert resp.status_code == 503

    def test_503_when_redis_unavailable(self, monkeypatch):
        monkeypatch.setattr(oauth, "get_redis", lambda: None)
        resp = client.get("/auth/github/login")
        assert resp.status_code == 503


class TestGithubCallback:
    def test_rejects_missing_code(self, fake_redis):
        resp = client.get("/auth/github/callback?state=whatever", follow_redirects=False)
        assert resp.status_code == 302
        assert "gh_oauth_error=invalid_state" in resp.headers["location"]

    def test_rejects_tampered_state(self, fake_redis):
        resp = client.get("/auth/github/callback?code=abc&state=nonce:9999999999:badsig", follow_redirects=False)
        assert "gh_oauth_error=invalid_state" in resp.headers["location"]

    def test_rejects_expired_state(self, fake_redis):
        # Valid signature, but expires_at is in the past.
        real_state = oauth._sign_state()
        nonce, _expires, sig = real_state.split(":", 2)
        expired = f"{nonce}:1:{sig}"  # signature won't match anyway (expiry is part of the signed message)
        resp = client.get(f"/auth/github/callback?code=abc&state={expired}", follow_redirects=False)
        assert "gh_oauth_error=invalid_state" in resp.headers["location"]

    def test_exchange_failure_redirects_with_error(self, fake_redis):
        state = oauth._sign_state()
        with patch(
            "httpx.AsyncClient.post",
            new_callable=AsyncMock,
            return_value=FakeHTTPResponse({"error": "bad_verification_code"}),
        ):
            resp = client.get(f"/auth/github/callback?code=badcode&state={state}", follow_redirects=False)
        assert "gh_oauth_error=exchange_failed" in resp.headers["location"]

    def test_network_error_redirects_with_error(self, fake_redis):
        state = oauth._sign_state()
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=ConnectionError("boom")):
            resp = client.get(f"/auth/github/callback?code=abc&state={state}", follow_redirects=False)
        assert "gh_oauth_error=exchange_failed" in resp.headers["location"]

    def test_success_stores_handoff_and_redirects(self, fake_redis):
        state = oauth._sign_state()
        with (
            patch(
                "httpx.AsyncClient.post",
                new_callable=AsyncMock,
                return_value=FakeHTTPResponse({"access_token": "gho_realtoken"}),
            ),
            patch(
                "httpx.AsyncClient.get",
                new_callable=AsyncMock,
                return_value=FakeHTTPResponse({"login": "octocat"}),
            ),
        ):
            resp = client.get(f"/auth/github/callback?code=goodcode&state={state}", follow_redirects=False)

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert location.startswith("https://frontend.example.com/?gh_handoff=")
        handoff_code = location.split("gh_handoff=")[1]
        stored = json.loads(fake_redis.kv[f"oauth:handoff:{handoff_code}"])
        assert stored == {"access_token": "gho_realtoken", "login": "octocat"}

    def test_success_survives_user_lookup_failure(self, fake_redis):
        """Fetching /user is best-effort — the flow must still succeed without it."""
        state = oauth._sign_state()
        with (
            patch(
                "httpx.AsyncClient.post",
                new_callable=AsyncMock,
                return_value=FakeHTTPResponse({"access_token": "gho_realtoken"}),
            ),
            patch("httpx.AsyncClient.get", new_callable=AsyncMock, side_effect=ConnectionError("boom")),
        ):
            resp = client.get(f"/auth/github/callback?code=goodcode&state={state}", follow_redirects=False)

        assert resp.status_code == 302
        assert "gh_handoff=" in resp.headers["location"]


class TestGithubExchange:
    async def test_returns_token_for_valid_code(self, fake_redis):
        await fake_redis.set("oauth:handoff:abc123", json.dumps({"access_token": "gho_x", "login": "octocat"}))
        resp = client.post("/auth/github/exchange", json={"code": "abc123"})
        assert resp.status_code == 200
        assert resp.json() == {"access_token": "gho_x", "login": "octocat"}

    async def test_code_is_single_use(self, fake_redis):
        await fake_redis.set("oauth:handoff:abc123", json.dumps({"access_token": "gho_x", "login": None}))
        first = client.post("/auth/github/exchange", json={"code": "abc123"})
        second = client.post("/auth/github/exchange", json={"code": "abc123"})
        assert first.status_code == 200
        assert second.status_code == 400

    def test_unknown_code_returns_400(self, fake_redis):
        resp = client.post("/auth/github/exchange", json={"code": "never-issued"})
        assert resp.status_code == 400

    def test_503_when_redis_unavailable(self, monkeypatch):
        monkeypatch.setattr(oauth, "get_redis", lambda: None)
        resp = client.post("/auth/github/exchange", json={"code": "whatever"})
        assert resp.status_code == 503

    def test_missing_code_is_rejected_by_validation(self, fake_redis):
        resp = client.post("/auth/github/exchange", json={})
        assert resp.status_code == 422


class TestStateSigning:
    def test_verify_accepts_freshly_signed_state(self, oauth_configured):
        assert oauth._verify_state(oauth._sign_state()) is True

    def test_verify_rejects_garbage(self, oauth_configured):
        assert oauth._verify_state("not-a-valid-state") is False

    def test_verify_rejects_wrong_signature(self, oauth_configured):
        nonce, expires_at, _sig = oauth._sign_state().split(":", 2)
        assert oauth._verify_state(f"{nonce}:{expires_at}:0" * 16) is False

    def test_state_differs_across_calls(self, oauth_configured):
        assert oauth._sign_state() != oauth._sign_state()
