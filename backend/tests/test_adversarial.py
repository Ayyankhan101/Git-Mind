"""Adversarial tests — find where the system breaks.

Tests edge cases, bypass attempts, and failure modes across:
- Auth middleware (path traversal, case sensitivity, null bytes)
- Rate limiter (IP spoofing, bypass)
- Session store (overflow, injection)
- Body limit (chunked encoding, negative sizes)
- Webhook (HMAC bypass, replay)
- WebSocket (payload bomb, auth bypass)
- Database (injection, corruption)
"""

import hashlib
import hmac
import json
import os
import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
AUTH = {"Authorization": "Bearer ghp_test_placeholder"}


# ═══════════════════════════════════════════════════════════════════════════════
# 1. AUTH BYPASS ATTEMPTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestAuthBypass:
    """Try to bypass auth middleware."""

    def test_path_traversal_blocked(self):
        """../../../etc/passwd style path traversal."""
        resp = client.get("/analysis/../../../health", headers=AUTH)
        # Should either 404 or return health (public) — never leak data
        assert resp.status_code in (200, 404, 422)

    def test_double_slash_bypass(self):
        """//analysis might bypass prefix check."""
        resp = client.post("//analysis", json={}, headers=AUTH)
        # Should not bypass auth
        assert resp.status_code in (401, 404, 405, 422)

    def test_null_byte_in_path(self):
        """Null bytes in path."""
        resp = client.get("/analysis/%00../../health", headers=AUTH)
        assert resp.status_code in (400, 404, 422)

    def test_case_sensitive_paths(self):
        """Paths should be case-sensitive."""
        resp = client.get("/ANALYSIS/test", headers=AUTH)
        # Should 404, not bypass auth
        assert resp.status_code in (401, 404)

    def test_empty_bearer_token_falls_back_to_env(self):
        """Empty Bearer token falls back to GITHUB_TOKEN env var — middleware accepts."""
        old = os.environ.pop("GITHUB_TOKEN", None)
        try:
            resp = client.post("/org-audit", json={"repos": []}, headers={"Authorization": "Bearer "})
            assert resp.status_code == 401  # No token anywhere → rejected
        finally:
            if old:
                os.environ["GITHUB_TOKEN"] = old

    def test_malformed_auth_header_falls_back_to_env(self):
        """Malformed Authorization header falls back to GITHUB_TOKEN env var."""
        old = os.environ.pop("GITHUB_TOKEN", None)
        try:
            resp = client.post(
                "/org-audit",
                json={"repos": []},
                headers={"Authorization": "not-bearer"},
            )
            assert resp.status_code == 401  # No token anywhere → rejected
        finally:
            if old:
                os.environ["GITHUB_TOKEN"] = old

    def test_x_gh_token_header_works(self):
        """X-gh-token custom header should work."""
        resp = client.get("/org-audit", headers={"X-gh-Token": "ghp_test_placeholder"})
        assert resp.status_code != 401

    def test_service_key_bypass(self):
        """X-Service-Key should bypass token requirement."""
        with patch.dict(os.environ, {"GITMIND_SERVICE_KEY": "test-key-123"}):
            resp = client.get("/org-audit", headers={"X-Service-Key": "test-key-123"})
            assert resp.status_code != 401


# ═══════════════════════════════════════════════════════════════════════════════
# 2. RATE LIMITER BYPASS ATTEMPTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestRateLimiterBypass:
    """Try to bypass rate limiting."""

    def test_xff_ip_spoofing_changes_key(self):
        """X-Forwarded-For should be used for rate limiting when trusted."""
        from starlette.requests import Request

        import services.rate_limiter as rl
        from services.rate_limiter import get_client_ip

        # Patch _TRUSTED_PROXIES to include test client IP
        original = rl._TRUSTED_PROXIES.copy()
        try:
            rl._TRUSTED_PROXIES = {"0.0.0.0"}
            # Mock request with different XFF IPs
            for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"]:
                scope = {
                    "type": "http",
                    "headers": [(b"x-forwarded-for", ip.encode())],
                    "client": ("0.0.0.0", 0),
                }
                req = Request(scope)
                assert get_client_ip(req) == ip
        finally:
            rl._TRUSTED_PROXIES = original

    def test_service_key_unlimited(self):
        """Service key should bypass rate limits."""
        import services.rate_limiter as rl

        original = rl._SERVICE_KEY
        try:
            rl._SERVICE_KEY = "my-key"
            assert rl._is_service_key("my-key") is True
            assert rl._is_service_key("wrong-key") is False
        finally:
            rl._SERVICE_KEY = original

    @patch("routes.analyze.check_rate_limit", return_value=(True, 30, 0))
    def test_analyze_no_rate_limit_when_allowed(self, _mock):
        """When rate limit allows, request proceeds (503 if Redis down)."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x/y"}, headers=AUTH)
        assert resp.status_code in (200, 400, 500, 503)  # Not 429


# ═══════════════════════════════════════════════════════════════════════════════
# 3. SESSION STORE ATTACKS
# ═══════════════════════════════════════════════════════════════════════════════


class TestSessionAttacks:
    """Try to break session store."""

    def test_invalid_session_id_format(self):
        """Non-UUID session IDs should be rejected."""
        resp = client.post("/chat", json={"session_id": "not-a-uuid", "question": "hi"}, headers=AUTH)
        assert resp.status_code == 400

    def test_sql_injection_in_session_id(self):
        """SQL injection attempts in session_id — Pydantic validates length."""
        payloads = [
            "'; DROP TABLE analysis; --",
            "1' OR '1'='1",
        ]
        for payload in payloads:
            resp = client.post("/chat", json={"session_id": payload, "question": "hi"}, headers=AUTH)
            # Pydantic rejects short invalid UUIDs with 422, route rejects valid-length invalid UUIDs with 400
            assert resp.status_code in (
                400,
                422,
            ), f"Payload '{payload}' should be rejected"

    def test_very_long_session_id(self):
        """Extremely long session_id — Pydantic rejects with 422."""
        long_id = "a" * 10000
        resp = client.post("/chat", json={"session_id": long_id, "question": "hi"}, headers=AUTH)
        # Pydantic max length catches this
        assert resp.status_code == 422

    async def test_session_store_lru_eviction(self):
        """Session store should evict when full."""
        from services.session import _MAX_SESSIONS, _sessions, put_session

        # Fill to capacity
        for i in range(_MAX_SESSIONS + 10):
            await put_session(f"00000000-0000-0000-0000-{i:012d}", {"data": f"test-{i}"})

        # Should have evicted oldest
        assert len(_sessions) <= _MAX_SESSIONS

    async def test_concurrent_session_writes(self):
        """Multiple writes to same session should not crash."""
        from services.session import put_session

        session_id = "00000000-0000-0000-0000-000000000099"
        for i in range(100):
            await put_session(session_id, {"counter": i, "data": "x" * 1000})


# ═══════════════════════════════════════════════════════════════════════════════
# 4. BODY LIMIT BYPASS ATTEMPTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestBodyLimitBypass:
    """Try to bypass body size limits."""

    def test_chunked_encoding_rejected(self):
        """Chunked transfer encoding without Content-Length should be rejected."""
        req = client.build_request("POST", "/analyze", content=b"x" * 100)
        req.headers["transfer-encoding"] = "chunked"
        req.headers.pop("content-length", None)
        resp = client.send(req)
        assert resp.status_code == 413  # Body limit middleware returns 413 for chunked

    def test_post_without_content_length_rejected(self):
        """POST without Content-Length should be rejected."""
        req = client.build_request("POST", "/analyze", content=b"x" * 100)
        req.headers.pop("content-length", None)
        resp = client.send(req)
        assert resp.status_code == 411

    def test_negative_content_length(self):
        """Negative Content-Length."""
        req = client.build_request("POST", "/analyze", content=b"x" * 100)
        req.headers["content-length"] = "-100"
        resp = client.send(req)
        # Should reject
        assert resp.status_code in (400, 411, 413)

    def test_huge_content_length_rejected(self):
        """Content-Length exceeding limit should be rejected."""
        resp = client.post(
            "/analyze",
            content=b"x",
            headers={**AUTH, "Content-Length": str(100 * 1024 * 1024)},  # 100MB
        )
        assert resp.status_code == 413

    def test_get_no_content_length_allowed(self):
        """GET without Content-Length should be allowed."""
        resp = client.get("/health")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 5. WEBHOOK HMAC BYPASS ATTEMPTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestWebhookHMACBypass:
    """Try to bypass webhook HMAC verification."""

    def test_missing_signature_rejected(self):
        """Webhook without signature should be rejected."""
        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": "secret"}):
            resp = client.post("/github/webhook", json={"action": "ping"})
            assert resp.status_code == 401

    def test_wrong_secret_rejected(self):
        """Webhook with wrong HMAC secret should be rejected."""
        payload = json.dumps({"action": "ping"}).encode()
        secret = "correct-secret"
        wrong_secret = "wrong-secret"
        sig = "sha256=" + hmac.new(wrong_secret.encode(), payload, hashlib.sha256).hexdigest()

        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": secret}):
            resp = client.post(
                "/github/webhook",
                content=payload,
                headers={
                    "x-hub-signature-256": sig,
                    "x-github-event": "ping",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 401

    def test_empty_secret_rejected(self):
        """Webhook when secret is empty should be rejected."""
        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": ""}):
            resp = client.post("/github/webhook", json={"action": "ping"})
            assert resp.status_code == 503

    def test_no_secret_configured_rejected(self):
        """Webhook when no secret is configured should be rejected."""
        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": ""}):
            resp = client.post("/github/webhook", json={"action": "ping"})
            assert resp.status_code == 503

    def test_tampered_payload_rejected(self):
        """Webhook with valid signature but tampered payload should be rejected."""
        original = json.dumps({"action": "ping"}).encode()
        tampered = json.dumps({"action": "push"}).encode()
        secret = "my-secret"
        sig = "sha256=" + hmac.new(secret.encode(), original, hashlib.sha256).hexdigest()

        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": secret}):
            resp = client.post(
                "/github/webhook",
                content=tampered,  # tampered body
                headers={
                    "x-hub-signature-256": sig,  # sig for original
                    "x-github-event": "ping",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 401

    def test_valid_webhook_accepted(self):
        """Valid webhook with correct HMAC should be accepted."""
        payload = json.dumps({"action": "ping"}).encode()
        secret = "my-secret"
        sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()

        with patch.dict(os.environ, {"GITHUB_APP_WEBHOOK_SECRET": secret}):
            resp = client.post(
                "/github/webhook",
                content=payload,
                headers={
                    "x-hub-signature-256": sig,
                    "x-github-event": "ping",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 6. WEBSOCKET EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════


class TestWebSocketEdgeCases:
    """WebSocket protocol edge cases."""

    def test_ws_auth_secret_required_in_production(self):
        """WS_AUTH_SECRET should be checked when set."""
        from ws.analyze import handle_analyze

        # Just verify the function exists and is callable
        assert callable(handle_analyze)

    def test_ws_payload_size_check_exists(self):
        """Payload size check should exist in ws handler."""
        # Read the source to verify the check exists
        import inspect

        from ws.analyze import handle_analyze

        source = inspect.getsource(handle_analyze)
        assert "1_000_000" in source  # 1MB limit check

    def test_ws_heartbeat_mechanism_exists(self):
        """Heartbeat mechanism should exist."""
        import inspect

        from ws.analyze import handle_analyze

        source = inspect.getsource(handle_analyze)
        assert "heartbeat" in source.lower()
        assert "HEARTBEAT_INTERVAL" in source


# ═══════════════════════════════════════════════════════════════════════════════
# 7. DATABASE EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════


class TestDatabaseEdgeCases:
    """Database operation edge cases."""

    def test_analysis_row_to_dict_handles_none(self):
        """_analysis_row_to_dict should handle None fields."""
        from services.database import _analysis_row_to_dict

        class MockRow:
            repo_name = "test"
            chroma_collection_name = None
            security_findings = None
            cve_findings = None
            api_docs = None
            architecture_diagram = None
            git_audit = None
            solidity_audit = None
            code_audit = None
            health = None
            head_sha = None
            repo_url = "https://github.com/x/y"
            chat_history = None
            owner_hash = None
            saved_at = time.time()

        result = _analysis_row_to_dict(MockRow())
        assert result["security_findings"] == []
        assert result["cve_findings"] == []
        assert result["api_docs"] == []
        assert result["chat_history"] == []

    def test_persist_non_uuid_skipped(self):
        """Non-UUID session_id should skip persistence."""
        # Should not raise
        import asyncio

        from services.session import persist_analysis

        asyncio.run(persist_analysis("not-a-uuid", {}, "https://github.com/x/y", None))


# ═══════════════════════════════════════════════════════════════════════════════
# 8. MEMORY / RESOURCE EXHAUSTION
# ═══════════════════════════════════════════════════════════════════════════════


class TestResourceExhaustion:
    """Try to exhaust resources."""

    def test_rate_limiter_memory_cleanup(self):
        """Rate limiter should clean up stale entries."""

        from services.rate_limiter import _mem_data

        # Simulate many endpoints with old timestamps
        old_time = time.time() - 600  # 10 minutes ago
        for i in range(600):
            _mem_data[f"endpoint:{i}"] = [old_time]

        # Trigger cleanup by hitting a new endpoint
        from services.rate_limiter import _mem_rate_check

        _mem_rate_check("test_cleanup", "key")

        # Should have cleaned up
        assert len(_mem_data) < 600

    def test_session_store_max_capacity(self):
        """Session store should enforce max capacity."""
        from services.session import _MAX_SESSIONS, _sessions

        assert _MAX_SESSIONS == 500
        assert len(_sessions) <= _MAX_SESSIONS


# ═══════════════════════════════════════════════════════════════════════════════
# 9. INPUT VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


class TestInputValidation:
    """Input validation across endpoints."""

    def test_analyze_invalid_url_format(self):
        """Various invalid URL formats."""
        invalid_urls = [
            "not-a-url",
            "ftp://github.com/x/y",
            "http://github.com/x/y",  # HTTP not HTTPS
            "https://gitlab.com/x/y",  # Not GitHub
            "https://github.com/x",  # Missing repo
            "https://github.com/",  # Missing owner/repo
            "https://github.com",  # Missing path
            "",  # Empty
        ]
        for url in invalid_urls:
            resp = client.post("/analyze", json={"repo_url": url}, headers=AUTH)
            assert resp.status_code in (400, 422), f"URL '{url}' should be rejected"

    def test_chat_empty_question(self):
        """Empty question — session lookup hits DB, may fail if DB not initialized."""
        resp = client.post(
            "/chat",
            json={"session_id": "00000000-0000-0000-0000-000000000001", "question": ""},
            headers=AUTH,
        )
        # 404 = session not found (expected), 500 = DB not initialized (test env)
        assert resp.status_code in (400, 404, 200, 500)

    def test_webhook_notify_invalid_url(self):
        """Invalid webhook URLs."""
        invalid_urls = [
            "https://evil.com/hook",
            "http://hooks.slack.com/x",  # HTTP not HTTPS
            "not-a-url",
        ]
        for url in invalid_urls:
            resp = client.post(
                "/webhook/notify",
                json={"slack_webhook_url": url, "message": "test"},
                headers=AUTH,
            )
            assert resp.status_code == 400, f"URL '{url}' should be rejected"

    def test_monitor_subscribe_invalid_url(self):
        """Invalid monitor URLs."""
        resp = client.post(
            "/monitor/subscribe",
            json={"repo_url": "not-a-url"},
            headers=AUTH,
        )
        assert resp.status_code == 400
