"""Tests for auth middleware — default-deny, public paths, token extraction."""

import os

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from services.auth import (
    AuthMiddleware,
    _is_public,
    get_gh_token,
    hash_token,
)


class TestIsPublic:
    """_is_public determines which paths skip auth."""

    def test_health_is_public(self):
        assert _is_public("/health") is True

    def test_docs_is_public(self):
        assert _is_public("/docs") is True

    def test_metrics_is_public(self):
        assert _is_public("/metrics") is True

    def test_openapi_is_public(self):
        assert _is_public("/openapi.json") is True

    def test_summary_is_public(self):
        assert _is_public("/summary") is True

    def test_analysis_prefix_is_public(self):
        assert _is_public("/analysis/abc-123") is True

    def test_repos_prefix_is_public(self):
        assert _is_public("/repos/someuser") is True

    def test_github_webhook_is_public(self):
        """Webhooks HMAC-verified in handler, exempt from middleware."""
        assert _is_public("/github/webhook") is True

    def test_protected_paths_require_auth(self):
        assert _is_public("/fix/pr") is False
        assert _is_public("/pr-review") is False
        assert _is_public("/org-audit") is False
        assert _is_public("/monitor/subscribe") is False


class TestAuthMiddleware:
    """Middleware-level default-deny: no token → 401."""

    @pytest.fixture
    def app(self):
        _app = FastAPI()
        _app.add_middleware(AuthMiddleware)

        @_app.get("/health")
        async def health():
            return {"ok": True}

        @_app.get("/protected")
        async def protected():
            return {"ok": True}

        return _app

    @pytest.fixture
    def client(self, app):
        return TestClient(app)

    def test_no_token_returns_401(self, client):
        """No header + no env var → 401."""
        os.environ.pop("GITHUB_TOKEN", None)
        resp = client.get("/protected")
        assert resp.status_code == 401

    def test_valid_bearer_token_passes(self, client):
        resp = client.get("/protected", headers={"Authorization": "Bearer ghp_test123"})
        assert resp.status_code == 200

    def test_valid_service_key_passes(self, client):
        os.environ["GITMIND_SERVICE_KEY"] = "test-service-key"
        resp = client.get("/protected", headers={"X-Service-Key": "test-service-key"})
        assert resp.status_code == 200
        del os.environ["GITMIND_SERVICE_KEY"]

    def test_any_bearer_token_passes_middleware(self, client):
        """Middleware accepts any Bearer token (format validated at route level)."""
        resp = client.get("/protected", headers={"Authorization": "Bearer any-token"})
        assert resp.status_code == 200

    def test_public_path_skips_auth(self, client):
        """/health is in _PUBLIC_PATHS — no auth needed."""
        resp = client.get("/health")
        assert resp.status_code == 200


class TestTokenExtraction:
    """get_gh_token / require_gh_token / require_gh_token_or_service_key."""

    def test_get_gh_token_from_bearer(self):
        from starlette.requests import Request

        scope = {
            "type": "http",
            "headers": [(b"authorization", b"Bearer ghp_abc123")],
        }
        req = Request(scope)
        assert get_gh_token(req) == "ghp_abc123"

    def test_get_gh_token_falls_back_to_env(self):
        from starlette.requests import Request

        os.environ["GITHUB_TOKEN"] = "ghp_env_token"
        scope = {"type": "http", "headers": []}
        req = Request(scope)
        assert get_gh_token(req) == "ghp_env_token"
        del os.environ["GITHUB_TOKEN"]

    def test_hash_token_deterministic(self):
        h1 = hash_token("secret-token")
        h2 = hash_token("secret-token")
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_hash_token_differs_for_different_inputs(self):
        assert hash_token("token-a") != hash_token("token-b")
