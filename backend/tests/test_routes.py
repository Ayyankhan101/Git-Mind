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
        assert "chromadb" in checks
        assert "git" in checks

    def test_groq_key_detected(self, client):
        resp = client.get("/health")
        assert resp.json()["checks"]["groq_key"] is True

    def test_sessions_starts_at_zero(self, client):
        resp = client.get("/health")
        assert resp.json()["sessions_active"] == 0


class TestRoutesWithoutSession:
    def test_summary_needs_session(self, client):
        resp = client.post("/summary", json={"session_id": "00000000-0000-0000-0000-000000000001"})
        assert resp.status_code == 200
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_chat_needs_session(self, client):
        resp = client.post(
            "/chat",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "question": "Hello",
            },
        )
        assert resp.status_code == 200
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_fix_needs_session(self, client):
        resp = client.post(
            "/fix",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "finding": {"rule": "test"},
            },
        )
        assert resp.status_code == 200
        assert resp.json().get("error") == "Session not found. Run /ws/analyze first."

    def test_incident_needs_session(self, client):
        resp = client.post(
            "/incident-report",
            json={
                "session_id": "00000000-0000-0000-0000-000000000001",
                "finding": {"title": "bug"},
            },
        )
        assert resp.status_code == 200
        assert resp.json().get("error") == "Session not found"

    def test_analysis_not_found(self, client):
        resp = client.get("/analysis/00000000-0000-0000-0000-000000000001")
        assert resp.status_code == 200
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
        resp = client.post("/org-audit", json={"repos": []})
        assert resp.json().get("error") == "repos list is empty"

    def test_org_audit_too_many_repos(self, client):
        repos = [f"https://github.com/owner/repo{i}" for i in range(21)]
        resp = client.post("/org-audit", json={"repos": repos})
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

    def test_valid_username_format(self, client):
        resp = client.get("/repos/test-user")
        assert resp.status_code == 200


class TestPRList:
    def test_invalid_repo_returns_empty(self, client):
        resp = client.get("/pr-list/unknown-owner/unknown-repo")
        assert resp.status_code == 200
        assert resp.json() == {"prs": []}
