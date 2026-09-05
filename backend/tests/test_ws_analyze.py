import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Ensure ENVIRONMENT is test before importing app
os.environ.setdefault("ENVIRONMENT", "test")

import ws.analyze as ws_analyze
from main import app

client = TestClient(app)


class FakeLockRedis:
    """Minimal async Redis stand-in for the single-flight lock (SET NX / GET / DELETE)."""

    def __init__(self, acquire_ok: bool = True):
        self.store: dict[str, str] = {}
        self.acquire_ok = acquire_ok
        self.set_calls = 0

    async def set(self, key, value, nx=False, ex=None):
        self.set_calls += 1
        if not self.acquire_ok:
            return False
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        self.store.pop(key, None)


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


def test_analyze_lock_key_is_deterministic_and_distinct():
    a = ws_analyze._analyze_lock_key("https://github.com/user/repo", "sha1")
    b = ws_analyze._analyze_lock_key("https://github.com/user/repo", "sha1")
    c = ws_analyze._analyze_lock_key("https://github.com/user/repo", "sha2")
    d = ws_analyze._analyze_lock_key("https://github.com/other/repo", "sha1")
    assert a == b
    assert a != c
    assert a != d


class TestWsAnalyzeSingleFlight:
    """A second client hitting the same repo@sha while the first is still
    analyzing should wait for the SHA cache instead of re-running the
    9-agent pipeline — see docs and the audit finding this fixes."""

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value="abc123")
    @patch("ws.analyze.get_redis")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_waits_then_replays_once_lock_holder_finishes(self, mock_get_redis, mock_sha, _mock_rate, monkeypatch):
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_POLL", 0.01)
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_MAX", 1.0)
        mock_get_redis.return_value = FakeLockRedis(acquire_ok=False)  # lock already held

        cached_snapshot = {
            "repo_name": "test-repo",
            "security_findings": [],
            "cve_findings": [],
            "api_docs": [],
            "architecture_diagram": None,
            "git_audit": None,
            "solidity_audit": None,
            "code_audit": None,
            "chroma_collection_name": None,
            "health": None,
        }
        # First call (pre-lock check): no snapshot yet. Second call (inside the
        # wait loop): the lock holder has finished and persisted.
        with (
            patch("ws.analyze.find_cached_snapshot", side_effect=[None, cached_snapshot]),
            client.websocket_connect("/ws/analyze") as ws,
        ):
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert "agent_status" in data
            last = data
            for _ in range(10):
                last = ws.receive_json()
                if last.get("done"):
                    break
            assert last.get("done") is True
            assert last.get("cached") is True

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value="abc123")
    @patch("ws.analyze.find_cached_snapshot", return_value=None)
    @patch("ws.analyze.graph")
    @patch("ws.analyze.get_redis")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_runs_independently_after_wait_times_out(
        self, mock_get_redis, mock_graph, _mock_find, mock_sha, _mock_rate, monkeypatch
    ):
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_POLL", 0.01)
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_MAX", 0.05)
        mock_get_redis.return_value = FakeLockRedis(acquire_ok=False)  # never released within the wait window

        async def _raise(*args, **kwargs):
            raise RuntimeError("pipeline crashed")

        mock_graph.astream = _raise

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert data.get("agent_status") == {"scanner": "running"}
            data2 = ws.receive_json()
            assert "error" in data2

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value="abc123")
    @patch("ws.analyze.find_cached_snapshot", return_value=None)
    @patch("ws.analyze.graph")
    @patch("ws.analyze.get_redis")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_acquired_lock_is_released_after_run(self, mock_get_redis, mock_graph, _mock_find, mock_sha, _mock_rate):
        fake_redis = FakeLockRedis(acquire_ok=True)
        mock_get_redis.return_value = fake_redis

        async def _raise(*args, **kwargs):
            raise RuntimeError("pipeline crashed")

        mock_graph.astream = _raise

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            ws.receive_json()  # agent_status: scanner running
            ws.receive_json()  # error

        assert fake_redis.set_calls == 1
        assert fake_redis.store == {}  # released, not left dangling for the TTL
