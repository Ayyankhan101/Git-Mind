"""Tests for SecurityHeadersMiddleware — defense-in-depth response headers."""

import os

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from services.security_headers import (
    _CSP_REPORT_ONLY,
    _HSTS_HEADER,
    _HSTS_VALUE,
    _PERMISSIONS_POLICY,
    SecurityHeadersMiddleware,
)


@pytest.fixture
def app():
    """Minimal FastAPI app with security headers middleware."""
    _app = FastAPI()
    _app.add_middleware(SecurityHeadersMiddleware)

    @_app.get("/ok")
    async def ok():
        return {"status": "ok"}

    return _app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestStandardHeaders:
    """Every response gets these5 headers regardless of path or method."""

    def test_x_frame_options_deny(self, client):
        resp = client.get("/ok")
        assert resp.headers["X-Frame-Options"] == "DENY"

    def test_x_content_type_options_nosniff(self, client):
        resp = client.get("/ok")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"

    def test_referrer_policy(self, client):
        resp = client.get("/ok")
        assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        resp = client.get("/ok")
        assert resp.headers["Permissions-Policy"] == _PERMISSIONS_POLICY

    def test_csp_report_only(self, client):
        resp = client.get("/ok")
        assert resp.headers["Content-Security-Policy-Report-Only"] == _CSP_REPORT_ONLY
        # Must NOT be enforced CSP (would break React inline styles)
        assert "Content-Security-Policy" not in resp.headers or "Report-Only" in resp.headers


class TestHSTS:
    """HSTS only emitted over HTTPS (direct or via X-Forwarded-Proto)."""

    def test_hsts_present_when_forwarded_proto_https(self, client):
        resp = client.get("/ok", headers={"X-Forwarded-Proto": "https"})
        assert resp.headers[_HSTS_HEADER] == _HSTS_VALUE

    def test_hsts_absent_when_http(self, client):
        """Plain http:// in dev must not set HSTS."""
        os.environ.pop("ENVIRONMENT", None)
        resp = client.get("/ok")
        assert _HSTS_HEADER not in resp.headers

    def test_hsts_uses_first_proto_when_multiple_proxies(self, client):
        """X-Forwarded-Proto may chain: 'https, http' — first wins."""
        resp = client.get("/ok", headers={"X-Forwarded-Proto": "https, http"})
        assert resp.headers[_HSTS_HEADER] == _HSTS_VALUE

    def test_hsts_absent_when_proto_is_http(self, client):
        resp = client.get("/ok", headers={"X-Forwarded-Proto": "http"})
        assert _HSTS_HEADER not in resp.headers
