import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Ensure ENVIRONMENT is test before importing app
os.environ.setdefault("ENVIRONMENT", "test")

import ws.analyze as ws_analyze
from app.main import app

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


class TestWsAnalyzeScannerFailure:
    """A failed clone/scan used to let every downstream (skipped) agent
    report empty/default results, which compute_health and the /summary
    LLM then presented as a normal-looking "clean" analysis — including an
    LLM-fabricated tech-stack description with zero real grounding (observed
    live: a Python/FastAPI repo confidently described as "Node.js/Express +
    PostgreSQL"). A scanner failure must hard-abort with a real error before
    any of that misleading downstream output is ever computed or sent."""

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value=None)
    @patch("ws.analyze.graph")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_scanner_failure_aborts_before_health_or_done(self, mock_graph, _mock_sha, _mock_rate):
        async def _failed_scan_stream(*args, **kwargs):
            yield {
                "scanner": {
                    "events": [{"agent": "scanner", "status": "error", "detail": "Git clone failed: repo not found"}]
                }
            }
            # Never reached — the abort must return before further chunks.
            yield {"architecture": {"events": [{"agent": "architecture", "status": "skipped"}]}}

        mock_graph.astream = _failed_scan_stream

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert data == {"agent_status": {"scanner": "running"}}
            data2 = ws.receive_json()
            assert "clone failed" in data2.get("error", "").lower()
            assert "health" not in data2
            with pytest.raises(Exception):
                ws.receive_json()  # connection closed — no health/done ever sent


class TestWsAnalyzeAbortPaths:
    """A stream timeout used to `break` out of the astream loop, which —
    since break isn't an exception — still fell into the try/else clause:
    computing and sending a health score (and, further down, persisting +
    sending "done") on a connection already known to be gone. That raised
    RuntimeError: Cannot call "send" once a close message has been sent,
    uncaught, deep in an aborted analysis. The abort path must return
    before reaching any of that follow-up work (the dead-heartbeat path
    shares the identical fix but isn't covered here — it needs a genuinely
    severed connection to trigger, which this in-process test client can't
    simulate)."""

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value=None)
    @patch("ws.analyze.graph")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_stream_timeout_does_not_send_health_or_done(self, mock_graph, _mock_sha, _mock_rate, monkeypatch):
        async def _slow_stream(*args, **kwargs):
            yield {"scanner": {"events": []}}
            # Never reached if the timeout check returns early, as it must.
            yield {"architecture": {"events": []}}

        mock_graph.astream = _slow_stream

        # ws.analyze does `import time` (the real shared module, not a local
        # `from time import time` binding) — patching ws_analyze.time.time
        # directly would patch time.time() for the whole process, including
        # structlog's own log timestamps. Swap the module *reference* instead,
        # scoped to this module only. First call computes the deadline; every
        # call after that reports it already exceeded, however many there are.
        class _FakeTime:
            def __init__(self):
                self.calls = 0

            def time(self):
                self.calls += 1
                return 0 if self.calls == 1 else 1_000_000

        monkeypatch.setattr(ws_analyze, "time", _FakeTime())

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            assert data == {"agent_status": {"scanner": "running"}}
            data2 = ws.receive_json()
            assert "timed out" in data2.get("error", "").lower()
            with pytest.raises(Exception):
                ws.receive_json()  # connection closed — no health/done ever sent


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

    @patch("ws.analyze.check_rate_limit", return_value=(True, 30, 0))
    @patch("ws.analyze.get_remote_sha", return_value="abc123")
    @patch("ws.analyze.find_cached_snapshot", return_value=None)
    @patch("ws.analyze.graph")
    @patch("ws.analyze.get_redis")
    @patch.dict(os.environ, {"ENVIRONMENT": "test"})
    def test_quota_exhausted_redis_does_not_drop_the_websocket(
        self, mock_get_redis, mock_graph, _mock_find, mock_sha, _mock_rate, monkeypatch
    ):
        """Regression: the reported production bug.

        A Redis that has run out of request quota stays connected and raises on
        every command. get_redis() returns a live client, so the `if _lock_redis:`
        guard passes and the unguarded SET used to raise straight out of the
        WebSocket handler — the socket closed uncleanly and the frontend showed
        "Connection dropped unexpectedly. Check the backend terminal for errors."

        The single-flight lock is an optimization. Losing it must cost the
        de-duplication, not the analysis.
        """
        from services import cache

        cache.clear_redis_degraded()

        class QuotaExhaustedRedis:
            def __init__(self):
                self.set_calls = 0

            async def set(self, *a, **k):
                self.set_calls += 1
                raise ConnectionError("max requests limit exceeded. Limit: 500000, Usage: 500000.")

            async def get(self, *a, **k):
                raise ConnectionError("max requests limit exceeded. Limit: 500000, Usage: 500000.")

            async def delete(self, *a, **k):
                raise ConnectionError("max requests limit exceeded. Limit: 500000, Usage: 500000.")

        fake_redis = QuotaExhaustedRedis()
        mock_get_redis.return_value = fake_redis

        # Would add 4 minutes per analysis if a failed acquire were mistaken for
        # contention, so keep the window short enough that the test would notice.
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_POLL", 0.01)
        monkeypatch.setattr(ws_analyze, "_ANALYZE_LOCK_WAIT_MAX", 0.05)

        async def _raise(*args, **kwargs):
            raise RuntimeError("pipeline crashed")

        mock_graph.astream = _raise

        with client.websocket_connect("/ws/analyze") as ws:
            ws.send_json({"repo_url": "https://github.com/user/repo", "gh_token": "ghp_test"})
            data = ws.receive_json()
            # Reaching this at all is the assertion: before the fix the handler
            # raised here and the client saw a WebSocketDisconnect instead.
            assert data.get("agent_status") == {"scanner": "running"}
            data2 = ws.receive_json()
            assert "error" in data2, "expected the pipeline error, delivered over a live socket"

        assert fake_redis.set_calls == 1, "the lock acquire should still be attempted once"
        assert cache.redis_degraded() == "quota exhausted"
        cache.clear_redis_degraded()
