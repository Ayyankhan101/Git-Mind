from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
# These routes are auth-gated. Identity comes from the caller's header only —
# the server's own GITHUB_TOKEN no longer authenticates anyone
# (see tests/test_auth_identity.py), so each call must present a token.
AUTH_HEADERS = {"Authorization": "Bearer ghp_test_placeholder"}


class TestWsTicketEndpoint:
    def test_returns_ticket_when_secret_configured(self, monkeypatch):
        monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
        resp = client.get("/ws-ticket")
        assert resp.status_code == 200
        assert "." in resp.json()["ticket"]

    def test_returns_none_when_secret_unconfigured(self, monkeypatch):
        monkeypatch.delenv("WS_AUTH_SECRET", raising=False)
        resp = client.get("/ws-ticket")
        assert resp.status_code == 200
        assert resp.json()["ticket"] is None

    def test_is_public_no_auth_required(self, monkeypatch):
        monkeypatch.setenv("WS_AUTH_SECRET", "ws-secret-placeholder")
        resp = client.get("/ws-ticket")  # no Authorization header
        assert resp.status_code == 200


class TestAnalyzeEndpoint:
    @patch("routes.analyze.check_rate_limit", return_value=(True, 30, 0))
    def test_analyze_invalid_url(self, _mock_rate):
        response = client.post("/analyze", json={"repo_url": "not-a-url"}, headers=AUTH_HEADERS)
        assert response.status_code == 400
        assert "error" in response.json()

    def test_analyze_missing_url(self):
        response = client.post("/analyze", json={}, headers=AUTH_HEADERS)
        assert response.status_code == 422

    @patch("routes.analyze.check_rate_limit", return_value=(False, 0, 60))
    def test_analyze_rate_limited(self, _mock_rate):
        response = client.post(
            "/analyze",
            json={
                "repo_url": "https://github.com/vercel/next.js",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 429
        assert "Rate limit" in response.json().get("error", "")
        assert "Retry-After" in response.headers

    @patch("routes.analyze.check_rate_limit", return_value=(True, 30, 0))
    def test_analyze_github_only(self, _mock_rate):
        response = client.post(
            "/analyze",
            json={"repo_url": "https://gitlab.com/user/repo"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400
        assert "error" in response.json()


class TestWebhookEndpoint:
    def test_webhook_invalid_url(self):
        response = client.post(
            "/webhook/notify",
            json={
                "slack_webhook_url": "https://evil.com/hook",
                "message": "test",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400
        assert "error" in response.json()

    def test_webhook_missing_fields(self):
        response = client.post("/webhook/notify", json={"message": "test"}, headers=AUTH_HEADERS)
        assert response.status_code == 422

    def test_webhook_rejects_non_slack(self):
        response = client.post(
            "/webhook/notify",
            json={
                "slack_webhook_url": "https://not-slack.example.com/hook",
                "message": "hi",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400
        assert "error" in response.json()


class TestMonitorEndpoint:
    def test_monitor_subscribe_invalid_url(self):
        response = client.post("/monitor/subscribe", json={"repo_url": "not-a-url"}, headers=AUTH_HEADERS)
        assert response.status_code == 400
        assert "error" in response.json()

    def test_monitor_subscribe_rejects_non_slack_webhook(self):
        """Regression: slack_webhook_url had no host allowlist, unlike
        /webhook/notify — a blind SSRF vector (internal services, cloud
        metadata endpoints) via the monitoring alert delivery path."""
        response = client.post(
            "/monitor/subscribe",
            json={
                "repo_url": "https://github.com/vercel/next.js",
                "slack_webhook_url": "http://169.254.169.254/latest/meta-data/",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400
        assert "error" in response.json()

    def test_monitor_subscribe_missing_fields(self):
        response = client.post("/monitor/subscribe", json={}, headers=AUTH_HEADERS)
        assert response.status_code == 422

    @patch("services.database.async_session_factory")
    def test_monitor_status_empty(self, mock_factory):
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        response = client.get("/monitor/status", headers=AUTH_HEADERS)
        assert response.status_code == 200
        assert response.json()["repos"] == []

    @patch("services.database.async_session_factory")
    def test_monitor_delete_not_found(self, mock_factory):
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_session.execute.return_value = mock_result
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        response = client.delete("/monitor/nonexistent-id", headers=AUTH_HEADERS)
        assert response.status_code == 404
        assert "error" in response.json()
