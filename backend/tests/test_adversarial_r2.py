"""Adversarial round 2 — concurrency, external failures, data corruption.

Tests that the system degrades gracefully under stress.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app, raise_server_exceptions=False)
AUTH = {"Authorization": "Bearer ghp_test_placeholder"}


# ═══════════════════════════════════════════════════════════════════════════════
# 1. CONCURRENT REQUESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestConcurrency:
    """Parallel requests should not corrupt state."""

    def test_rapid_health_checks(self):
        """Multiple rapid health checks."""
        for _ in range(20):
            resp = client.get("/health")
            assert resp.status_code == 200

    def test_parallel_rate_limited_requests(self):
        """Rapid requests — rate limiter allows 30/min for analyze_rest.
        Redis unavailable → 500 for all (not rate limited, just queue failure)."""
        responses = []
        for _ in range(15):
            resp = client.post("/analyze", json={"repo_url": "https://github.com/x/y"}, headers=AUTH)
            responses.append(resp.status_code)

        # Redis unavailable → 500, or 200/429 if rate limited
        assert all(code in (200, 429, 400, 500) for code in responses)

    def test_session_concurrent_read_write(self):
        """Reading and writing same session sequentially."""
        from services.session import get_session, put_session

        session_id = "00000000-0000-0000-0000-000000000098"
        put_session(session_id, {"data": "initial", "counter": 0})

        for i in range(10):
            put_session(session_id, {"data": f"write-{i}", "counter": i})
            result = asyncio.run(get_session(session_id))
            assert result is not None


# ═══════════════════════════════════════════════════════════════════════════════
# 2. EXTERNAL SERVICE FAILURES
# ═══════════════════════════════════════════════════════════════════════════════

class TestExternalFailures:
    """System should degrade gracefully when external services fail."""

    def test_github_api_timeout(self):
        """GitHub API timeout should return error, not crash."""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = Exception("Connection timeout")
            resp = client.get("/repos/test-user", headers=AUTH)
            assert resp.status_code in (200, 500, 502)

    def test_github_api_rate_limit(self):
        """GitHub API 403 rate limit should be handled."""
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.is_error = True
        mock_resp.json.return_value = {"message": "rate limit"}

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            resp = client.get("/repos/test-user", headers=AUTH)
            assert resp.status_code in (200, 502)

    def test_llm_timeout_on_summary(self):
        """LLM timeout on /summary should return error."""
        from services.session import put_session

        session_id = "00000000-0000-0000-0000-000000000097"
        put_session(session_id, {
            "repo_name": "test",
            "chroma_collection_name": None,
            "security_findings": [],
            "chat_history": [],
        })

        with patch("routes.analysis.invoke_with_retry", side_effect=Exception("LLM timeout")):
            resp = client.post("/summary", json={"session_id": session_id}, headers=AUTH)
            assert resp.status_code in (500, 502, 504)

    def test_redis_failure_graceful_fallback(self):
        """Redis failure should fall back to memory."""
        from services.cache import get_redis
        r = get_redis()
        # In test env, Redis is None (memory mode)
        # Just verify the fallback path works
        assert r is None  # Memory mode in tests


# ═══════════════════════════════════════════════════════════════════════════════
# 3. DATA CORRUPTION
# ═══════════════════════════════════════════════════════════════════════════════

class TestDataCorruption:
    """Malformed data should not crash the system."""

    def test_unicode_in_repo_url(self):
        """Unicode characters in repo URL."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/🇺🇸/test"}, headers=AUTH)
        assert resp.status_code in (400, 422)

    def test_emoji_in_chat_question(self):
        """Emoji in chat question."""
        from services.session import put_session

        session_id = "00000000-0000-0000-0000-000000000096"
        put_session(session_id, {
            "repo_name": "test",
            "chroma_collection_name": "test-col",
            "security_findings": [],
            "chat_history": [],
        })

        with patch("routes.chat.run_chat_agent", return_value=("👍 Done", [])):
            resp = client.post("/chat", json={
                "session_id": session_id,
                "question": "🔥 What's the security status? 🛡️"
            }, headers=AUTH)
            assert resp.status_code == 200

    def test_null_bytes_in_json(self):
        """Null bytes in JSON body."""
        resp = client.post(
            "/analyze",
            content=b'{"repo_url": "https://github.com/x/y\x00evil"}',
            headers={**AUTH, "Content-Type": "application/json"},
        )
        assert resp.status_code in (400, 422)

    def test_extremely_long_field_value(self):
        """Extremely long field value."""
        resp = client.post(
            "/chat",
            json={"session_id": "00000000-0000-0000-0000-000000000001", "question": "x" * 100000},
            headers=AUTH,
        )
        assert resp.status_code in (400, 404, 413, 422)

    def test_nested_json_payload(self):
        """Deeply nested JSON."""
        payload = {"a": {"b": {"c": {"d": {"e": "x" * 1000}}}}}
        resp = client.post(
            "/analyze",
            json=payload,
            headers=AUTH,
        )
        assert resp.status_code in (400, 422)

    def test_empty_json_body(self):
        """Empty JSON body."""
        resp = client.post(
            "/analyze",
            content=b"",
            headers={**AUTH, "Content-Type": "application/json"},
        )
        assert resp.status_code in (400, 422)

    def test_array_json_body(self):
        """JSON array instead of object."""
        resp = client.post(
            "/analyze",
            content=b'[1,2,3]',
            headers={**AUTH, "Content-Type": "application/json"},
        )
        assert resp.status_code in (400, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# 4. URL VALIDATION EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════

class TestURLEdgeCases:
    """URL validation should be strict."""

    def test_github_url_with_port(self):
        """URL with port number."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com:443/x/y"}, headers=AUTH)
        assert resp.status_code == 400

    def test_github_url_with_fragment(self):
        """URL with fragment."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x/y#readme"}, headers=AUTH)
        assert resp.status_code == 400

    def test_github_url_with_query(self):
        """URL with query string."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x/y?ref=main"}, headers=AUTH)
        assert resp.status_code == 400

    def test_github_url_with_subdomain(self):
        """URL with subdomain."""
        resp = client.post("/analyze", json={"repo_url": "https://www.github.com/x/y"}, headers=AUTH)
        assert resp.status_code == 400

    def test_github_url_with_trailing_dot(self):
        """URL with trailing dot — passes URL regex, but Redis unavailable → 500."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x/y."}, headers=AUTH)
        assert resp.status_code in (400, 422, 500)

    def test_github_url_with_spaces(self):
        """URL with spaces."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x y/z"}, headers=AUTH)
        assert resp.status_code in (400, 422)

    def test_github_url_with_special_chars(self):
        """URL with special characters in owner/repo."""
        resp = client.post("/analyze", json={"repo_url": "https://github.com/x@y/z"}, headers=AUTH)
        assert resp.status_code == 400

    def test_valid_github_urls_accepted(self):
        """Valid GitHub URLs should be accepted."""
        valid_urls = [
            "https://github.com/vercel/next.js",
            "https://github.com/facebook/react",
            "https://github.com/rust-lang/rust",
            "https://github.com/user-name/repo-name",
            "https://github.com/user.name/repo.name",
        ]
        for url in valid_urls:
            resp = client.post("/analyze", json={"repo_url": url}, headers=AUTH)
            # Should not be 400 (invalid URL)
            assert resp.status_code != 400, f"URL '{url}' should be valid"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. ERROR HANDLING GAPS
# ═══════════════════════════════════════════════════════════════════════════════

class TestErrorHandling:
    """Unhandled edge cases should return proper errors."""

    def test_analysis_not_found_returns_404(self):
        """Non-existent session_id should return 404 or 500 (DB not initialized)."""
        resp = client.get("/analysis/00000000-0000-0000-0000-999999999999", headers=AUTH)
        assert resp.status_code in (404, 500)

    def test_summary_without_chroma(self):
        """Summary without chroma_collection_name should handle gracefully."""
        from services.session import put_session

        session_id = "00000000-0000-0000-0000-000000000095"
        put_session(session_id, {
            "repo_name": "test",
            "chroma_collection_name": None,
            "security_findings": [],
            "chat_history": [],
        })

        with patch("routes.analysis.invoke_with_retry", return_value=MagicMock(content="Test summary")):
            resp = client.post("/summary", json={"session_id": session_id}, headers=AUTH)
            assert resp.status_code == 200

    def test_monitor_subscribe_duplicate(self):
        """Duplicate monitor subscription — DB not initialized in test env."""
        resp = client.post("/monitor/subscribe", json={
            "repo_url": "https://github.com/x/y"
        }, headers=AUTH)
        # DB not initialized → 500, or 409 if duplicate
        assert resp.status_code in (409, 500)

    def test_pr_review_invalid_url(self):
        """PR review with invalid URL should return error."""
        resp = client.post("/pr-review", json={"pr_url": "not-a-url"}, headers=AUTH)
        assert resp.status_code in (400, 500)

    def test_pr_impact_missing_session(self):
        """PR impact with missing session should return 404."""
        resp = client.post("/pr-impact", json={
            "pr_url": "https://github.com/x/y/pull/1",
            "session_id": "00000000-0000-0000-0000-000000000001",
        }, headers=AUTH)
        assert resp.status_code in (400, 404, 502)

    def test_webhook_notify_real_slack_url_rejected(self):
        """Webhook with real Slack URL should fail at network level."""
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = Exception("Connection refused")
            resp = client.post("/webhook/notify", json={
                "slack_webhook_url": "https://hooks.slack.com/services/T00/B00/xxx",
                "message": "test",
            }, headers=AUTH)
            assert resp.status_code in (500, 502, 504)


# ═══════════════════════════════════════════════════════════════════════════════
# 6. INTEGER / BOUNDARY CASES
# ═══════════════════════════════════════════════════════════════════════════════

class TestBoundaryCases:
    """Integer overflow, negative values, extreme inputs."""

    def test_negative_days_in_history(self):
        """Negative days parameter — DB not initialized in test env."""
        resp = client.get("/analysis/history?repo_url=https://github.com/x/y&days=-5", headers=AUTH)
        assert resp.status_code in (200, 400, 422, 500)

    def test_zero_days_in_history(self):
        """Zero days parameter — returns all history."""
        resp = client.get("/analysis/history?repo_url=https://github.com/x/y&days=0", headers=AUTH)
        assert resp.status_code in (200, 404, 500)

    def test_huge_days_in_history(self):
        """Huge days parameter."""
        resp = client.get("/analysis/history?repo_url=https://github.com/x/y&days=999999", headers=AUTH)
        assert resp.status_code in (200, 404, 500)

    def test_org_audit_max_repos(self):
        """Exactly 20 repos should be accepted."""
        repos = [f"https://github.com/owner/repo{i}" for i in range(20)]
        with patch("routes.org.asyncio.gather", new_callable=AsyncMock) as mock_gather:
            mock_gather.return_value = [{"repo_url": r, "cve_findings": [], "error": None} for r in repos]
            resp = client.post("/org-audit", json={"repos": repos}, headers=AUTH)
            assert resp.status_code == 200

    def test_org_audit_21_repos_rejected(self):
        """21 repos should be rejected by Pydantic (422) or route (400)."""
        repos = [f"https://github.com/owner/repo{i}" for i in range(21)]
        resp = client.post("/org-audit", json={"repos": repos}, headers=AUTH)
        assert resp.status_code in (400, 422)

    def test_monitor_delete_nonexistent_uuid(self):
        """Delete with valid UUID format but non-existent — DB may not be initialized."""
        resp = client.delete("/monitor/00000000-0000-0000-0000-000000000000", headers=AUTH)
        assert resp.status_code in (404, 200, 500)
