import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Ensure ENVIRONMENT is test before importing app
os.environ.setdefault("ENVIRONMENT", "test")

from main import app

client = TestClient(app)


class TestWsAnalyze:
    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_invalid_payload_closes(self, _mock_rate):
        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_text("not json")
            with pytest.raises(Exception):
                ws.receive_json()

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_missing_repo_url(self, _mock_rate):
        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "error" in data

    @patch("ws.analyze.check_rate_limit", return_value=(False, 0, 60))
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_rate_limited(self, _mock_rate):
        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "rate limit" in data.get("error", "").lower()

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value="abc123")
    @patch("ws.analyze.find_cached_snapshot")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_cache_hit(self, mock_find, mock_sha, _mock_rate):
        mock_find.return_value = {
            "repo_name": "test-repo",
            "security_findings": [{"id": "s1"}],
            "cve_findings": [],
            "api_docs": [],
            "architecture_diagram": None,
            "git_audit": None,
            "solidity_audit": None,
            "code_audit": None,
            "chroma_collection_name": None,
            "health": None,
        }
        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "agent_status" in data
            data2 = ws.receive_json()
            assert "architecture_diagram" in data2
            data3 = ws.receive_json()
            assert "security_findings" in data3
            data4 = ws.receive_json()
            assert "health" in data4
            data5 = ws.receive_json()
            assert data5.get("done") is True
            assert data5.get("cached") is True

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value=None)
    @patch("ws.analyze.graph")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_pipeline_error(self, mock_graph, mock_sha, _mock_rate):
        async def _raise(*args, **kwargs):
            raise RuntimeError("pipeline crashed")

        mock_graph.astream = _raise

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "agent_status" in data
            data2 = ws.receive_json()
            assert "error" in data2
