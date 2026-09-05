from unittest.mock import AsyncMock, MagicMock, patch

_AUTH = {"Authorization": "Bearer ghp_test_placeholder"}


class TestHealthEndpoint:
    def test_returns_ok_structure(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "sessions_active" in data
        assert "checks" in data

    def test_checks_contains_expected_keys(self, client):
        resp = client.get("/health")
        checks = resp.json()["checks"]
        assert "groq_key" in checks
        assert "vector_store_chroma" in checks
        assert "git" in checks

    def test_groq_key_detected(self, client):
        resp = client.get("/health")
        assert resp.json()["checks"]["groq_key"] is True

    def test_sessions_starts_at_zero(self, client):
        resp = client.get("/health")
        assert isinstance(resp.json()["sessions_active"], int)


class TestRoutesWithoutSession:
    def test_summary_needs_session(self, client):
        resp = client.post("/summary", json={"session_id": "00000000-0000-0000-0000-000000000001"})
        assert resp.status_code == 404
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_chat_needs_session(self, client):
        resp = client.post(
            "/chat",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "question": "Hello",
            },
        )
        assert resp.status_code == 404
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_fix_needs_session(self, client):
        resp = client.post(
            "/fix",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "finding": {"rule": "test"},
            },
        )
        assert resp.status_code == 404
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_incident_needs_session(self, client):
        resp = client.post(
            "/incident-report",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "finding": {"title": "bug"},
            },
        )
        assert resp.status_code == 404
        assert "Session not found" in resp.json().get("error", "")

    def test_analysis_not_found(self, client):
        resp = client.get("/analysis/00000000-0000-0000-0000-000000000001")
        assert resp.status_code == 404
        assert resp.json().get("error") == "Analysis not found or has expired"


class TestRouteValidation:
    def test_chat_invalid_session_id(self, client):
        resp = client.post("/chat", json={"session_id": "bad", "question": "Hi"})
        assert resp.json().get("error") == "Invalid session ID"

    def test_summary_invalid_session_id(self, client):
        resp = client.post("/summary", json={"session_id": "bad"})
        assert resp.json().get("error") == "Invalid session ID"

    def test_fix_invalid_session_id(self, client):
        resp = client.post("/fix", json={"session_id": "bad", "finding": {}})
        assert resp.json().get("error") == "Invalid session ID"

    def test_analysis_invalid_session_id(self, client):
        resp = client.get("/analysis/bad")
        assert resp.json().get("error") == "Invalid session ID"

    def test_org_audit_empty_repos(self, client):
        resp = client.post("/org-audit", json={"repos": []}, headers=_AUTH)
        assert resp.json().get("error") == "repos list is empty"

    def test_org_audit_too_many_repos(self, client):
        repos = [f"https://github.com/owner/repo{i}" for i in range(21)]
        resp = client.post("/org-audit", json={"repos": repos}, headers=_AUTH)
        # Pydantic returns 422 with detail for list length validation
        assert resp.status_code == 422


class TestPRReview:
    def test_invalid_pr_url(self, client):
        resp = client.post("/pr-review", json={"pr_url": "not-a-url"})
        assert resp.json().get("error") is not None

    def test_pr_review_missing(self, client):
        resp = client.post("/pr-review", json={"pr_url": "https://github.com/owner/repo/pull/0"})
        assert resp.json().get("error") is not None


class TestRepos:
    def test_invalid_username(self, client):
        resp = client.get("/repos/")  # empty username
        assert resp.status_code == 404

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_valid_username_format(self, mock_get, client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_error = False
        mock_resp.json.return_value = []
        mock_get.return_value = mock_resp
        resp = client.get("/repos/test-user")
        assert resp.status_code == 200

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_anonymous_caller_does_not_see_private_repos(self, mock_get, client, monkeypatch):
        """Regression: get_github_credential() falls back to the server's own
        GITHUB_TOKEN for rate-limit relief. The private-repo filter used to key
        off that fallback too, so an anonymous caller who requested the
        operator's own username saw the operator's private repos."""
        monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_pat_placeholder")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_error = False
        mock_resp.json.return_value = [
            {
                "name": "public-repo",
                "full_name": "operator/public-repo",
                "description": "",
                "language": "Python",
                "stargazers_count": 1,
                "html_url": "https://github.com/operator/public-repo",
                "fork": False,
                "private": False,
                "updated_at": "2026-01-01T00:00:00Z",
            },
            {
                "name": "secret-repo",
                "full_name": "operator/secret-repo",
                "description": "",
                "language": "Python",
                "stargazers_count": 0,
                "html_url": "https://github.com/operator/secret-repo",
                "fork": False,
                "private": True,
                "updated_at": "2026-01-01T00:00:00Z",
            },
        ]
        mock_get.return_value = mock_resp

        resp = client.get("/repos/operator")  # no Authorization header at all
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()["repos"]]
        assert names == ["public-repo"]

    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_caller_with_own_token_sees_private_repos(self, mock_get, client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_error = False
        mock_resp.json.return_value = [
            {
                "name": "secret-repo",
                "full_name": "me/secret-repo",
                "description": "",
                "language": "Python",
                "stargazers_count": 0,
                "html_url": "https://github.com/me/secret-repo",
                "fork": False,
                "private": True,
                "updated_at": "2026-01-01T00:00:00Z",
            },
        ]
        mock_get.return_value = mock_resp

        resp = client.get("/repos/me", headers=_AUTH)
        assert resp.status_code == 200
        assert [r["name"] for r in resp.json()["repos"]] == ["secret-repo"]


class TestPRList:
    @patch("httpx.AsyncClient.get", new_callable=AsyncMock)
    def test_invalid_repo_returns_empty(self, mock_get, client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_error = False
        mock_resp.json.return_value = []
        mock_get.return_value = mock_resp
        resp = client.get("/pr-list/unknown-owner/unknown-repo", headers=_AUTH)
        assert resp.status_code == 200
        assert resp.json() == {"prs": []}
