import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Ensure ENVIRONMENT is test before importing app
os.environ.setdefault("ENVIRONMENT", "test")

from main import app

client = TestClient(app)


class TestWsCrisis:
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_invalid_payload_closes(self):
        with client.websocket_connect("/ws/crisis") as ws:
            ws.send_text("not json")
            with pytest.raises(Exception):
                ws.receive_json()

    @patch("ws.crisis.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.crisis.get_session", return_value=None)
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_session_not_found(self, mock_session, _mock_rate):
        with client.websocket_connect("/ws/crisis") as ws:
            ws.send_json({"session_id": "nonexistent", "finding_id": "f1", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "error" in data
            assert "Session not found" in data["error"]

    @patch("ws.crisis.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.crisis.get_session")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_no_findings(self, mock_session, _mock_rate):
        mock_session.return_value = {"security_findings": []}
        with client.websocket_connect("/ws/crisis") as ws:
            ws.send_json({"session_id": "s1", "finding_id": "f1", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "error" in data

    @patch("ws.crisis.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.crisis.get_session")
    @patch("ws.crisis.crisis_graph")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_normal_flow(self, mock_graph, mock_session, _mock_rate):
        mock_session.return_value = {"security_findings": [{"id": "f1", "title": "SQL injection"}]}

        async def _astream(*args, **kwargs):
            yield {"engineer": {"crisis_messages": [{"agent": "engineer", "content": "Analysis complete", "turn": 0}]}}

        mock_graph.astream = _astream

        with client.websocket_connect("/ws/crisis") as ws:
            ws.send_json({"session_id": "s1", "finding_id": "f1", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert data.get("kind") == "message"
