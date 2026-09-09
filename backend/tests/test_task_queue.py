"""Crash-recovery reaper for the Redis-backed task queue.

BRPOP removes a task from the queue the instant a worker picks it up, before
it runs — so if the worker process dies mid-task (OOM, deploy, crash), the
task is left at status "running" forever with nothing to redeliver it. These
tests cover the periodic sweep that detects and requeues/fails that case.
"""

import asyncio
import contextlib
import fnmatch
import time

import orjson
import pytest

from services import task_queue as tq


class FakeRedis:
    """Minimal async Redis stand-in with real storage (get/set/lpush/scan)."""

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    async def get(self, key):
        return self.kv.get(key)

    async def set(self, key, value, ex=None):
        self.kv[key] = value
        return True

    async def lpush(self, key, *values):
        bucket = self.lists.setdefault(key, [])
        for v in values:
            bucket.insert(0, v)
        return len(bucket)

    async def rpop(self, key):
        bucket = self.lists.get(key)
        if not bucket:
            return None
        return bucket.pop()

    async def scan(self, _cursor, match=None, count=100):
        keys = [k for k in self.kv if not match or fnmatch.fnmatch(k, match)]
        return 0, keys


@pytest.fixture
def fake_redis(monkeypatch):
    r = FakeRedis()
    monkeypatch.setattr(tq, "get_redis", lambda: r)
    return r


async def _seed_task(fake_redis, task_id, status, running_since=None, retries=3):
    task = {
        "id": task_id,
        "type": "run_analysis",
        "args": {},
        "status": status,
        "created_at": time.time(),
        "completed_at": None,
        "result": None,
        "error": None,
        "retries": retries,
    }
    if running_since is not None:
        task["running_since"] = running_since
    await fake_redis.set(f"{tq._TASK_PREFIX}{task_id}", orjson.dumps(task, default=str).decode())
    return task


class TestWorker:
    """Dequeue polls RPOP instead of blocking on BRPOP — Upstash's serverless
    Redis rejects blocking commands outright regardless of ACL permissions,
    so polling is what actually works there (and on a real Redis server)."""

    async def test_dequeues_and_executes_queued_task(self, fake_redis, monkeypatch):
        monkeypatch.setattr(tq, "_POLL_INTERVAL", 0.01)
        await _seed_task(fake_redis, "poll1", "pending")
        await fake_redis.lpush(tq._QUEUE_KEY, orjson.dumps({"task_id": "poll1", "retries": 3}).decode())

        ran = asyncio.Event()

        async def _factory(_args):
            ran.set()
            return {"ok": True}

        monkeypatch.setitem(tq._TASK_REGISTRY, "run_analysis", _factory)

        worker = asyncio.create_task(tq._worker())
        await asyncio.wait_for(ran.wait(), timeout=2)
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

        stored = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}poll1"))
        assert stored["status"] == "completed"

    async def test_empty_queue_polls_without_raising(self, fake_redis, monkeypatch):
        monkeypatch.setattr(tq, "_POLL_INTERVAL", 0.01)
        worker = asyncio.create_task(tq._worker())
        await asyncio.sleep(0.05)
        assert not worker.done()
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

    async def test_survives_rpop_errors_and_keeps_polling(self, fake_redis, monkeypatch):
        monkeypatch.setattr(tq, "_POLL_INTERVAL", 0.01)
        monkeypatch.setattr(tq, "_ERROR_RETRY_MIN", 0.01)
        monkeypatch.setattr(tq, "_ERROR_RETRY_MAX", 0.02)

        calls = {"n": 0}
        real_rpop = fake_redis.rpop

        async def _flaky_rpop(key):
            calls["n"] += 1
            if calls["n"] <= 2:
                raise ConnectionError("this user has no permissions to run the 'brpop' command")
            return await real_rpop(key)

        monkeypatch.setattr(fake_redis, "rpop", _flaky_rpop)

        worker = asyncio.create_task(tq._worker())
        await asyncio.sleep(0.05)
        assert not worker.done(), "a transient RPOP error must not crash the worker loop"
        assert calls["n"] >= 2
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


class TestReapStaleTask:
    async def test_requeues_when_retries_remain(self, fake_redis):
        task = await _seed_task(fake_redis, "t1", "running", running_since=0.0, retries=2)
        await tq._reap_stale_task(task, fake_redis)

        stored = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}t1"))
        assert stored["status"] == "pending"
        assert stored["retries"] == 1
        assert "running_since" not in stored
        queued = fake_redis.lists.get(tq._QUEUE_KEY) or []
        assert len(queued) == 1
        assert orjson.loads(queued[0])["task_id"] == "t1"

    async def test_fails_permanently_when_retries_exhausted(self, fake_redis):
        task = await _seed_task(fake_redis, "t2", "running", running_since=0.0, retries=0)
        await tq._reap_stale_task(task, fake_redis)

        stored = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}t2"))
        assert stored["status"] == "failed"
        assert "reaped" in stored["error"].lower()
        assert stored["completed_at"] is not None
        queued = fake_redis.lists.get(tq._QUEUE_KEY) or []
        assert len(queued) == 0


class TestPeriodicReap:
    async def test_reaps_stale_but_leaves_fresh_running_task_alone(self, fake_redis, monkeypatch):
        monkeypatch.setattr(tq, "_REAP_INTERVAL", 0.01)
        monkeypatch.setattr(tq, "_TASK_TIMEOUT", 5)
        monkeypatch.setattr(tq, "_REAP_GRACE", 1)
        await _seed_task(fake_redis, "stale1", "running", running_since=time.time() - 1000, retries=1)
        await _seed_task(fake_redis, "fresh1", "running", running_since=time.time(), retries=1)
        await _seed_task(fake_redis, "done1", "completed", running_since=time.time() - 1000, retries=1)

        task = asyncio.create_task(tq._periodic_reap())
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

        stale = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}stale1"))
        fresh = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}fresh1"))
        done = orjson.loads(await fake_redis.get(f"{tq._TASK_PREFIX}done1"))
        assert stale["status"] == "pending", "stuck task past timeout+grace should be requeued"
        assert fresh["status"] == "running", "task still within its timeout window must not be touched"
        assert done["status"] == "completed", "non-running tasks must not be touched"

    async def test_noop_without_redis(self, monkeypatch):
        monkeypatch.setattr(tq, "get_redis", lambda: None)
        monkeypatch.setattr(tq, "_REAP_INTERVAL", 0.01)

        task = asyncio.create_task(tq._periodic_reap())
        await asyncio.sleep(0.03)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task  # should not raise


class TestQuotaExhaustedRedis:
    """A connected client whose every command is rejected.

    This is the third Redis state — not "unavailable" (get_redis() returns a
    client) and not "healthy". It is what a managed Redis does once its request
    quota runs out, and in production it dropped analysis WebSockets and buried
    the log under 567 identical retry warnings.
    """

    QUOTA_ERR = "max requests limit exceeded. Limit: 500000, Usage: 500000."

    @staticmethod
    def _quota_redis():
        class _R:
            def __init__(self):
                self.calls = 0

            def _boom(self, *a, **k):
                self.calls += 1
                raise ConnectionError(TestQuotaExhaustedRedis.QUOTA_ERR)

            async def rpop(self, *a, **k):
                return self._boom()

            async def get(self, *a, **k):
                return self._boom()

            async def set(self, *a, **k):
                return self._boom()

            async def lpush(self, *a, **k):
                return self._boom()

        return _R()

    def test_quota_error_is_recognised(self):
        from services.cache import is_quota_error

        assert is_quota_error(ConnectionError(self.QUOTA_ERR))
        assert not is_quota_error(ConnectionError("connection reset by peer"))

    async def test_worker_parks_instead_of_hammering(self, monkeypatch):
        """The whole point: a hard cap must not be retried on a tight timer."""
        from services import cache

        cache.clear_redis_degraded()
        r = self._quota_redis()
        monkeypatch.setattr(tq, "get_redis", lambda: r)
        monkeypatch.setattr(tq, "_QUOTA_RETRY_DELAY", 0.5)
        monkeypatch.setattr(tq, "_ERROR_RETRY_MIN", 0.001)

        worker = asyncio.create_task(tq._worker())
        await asyncio.sleep(0.15)
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

        assert r.calls == 1, f"quota error must park on _QUOTA_RETRY_DELAY, not retry — saw {r.calls} calls in 0.15s"
        assert cache.redis_degraded() == "quota exhausted"
        cache.clear_redis_degraded()

    async def test_transient_error_still_backs_off_and_escalates(self, monkeypatch):
        """A blip is not a cap — it must keep retrying, just not at a flat rate."""
        from services import cache

        cache.clear_redis_degraded()

        class _R:
            def __init__(self):
                self.calls = 0

            async def rpop(self, *a, **k):
                self.calls += 1
                raise ConnectionError("connection reset by peer")

        r = _R()
        monkeypatch.setattr(tq, "get_redis", lambda: r)
        monkeypatch.setattr(tq, "_ERROR_RETRY_MIN", 0.01)
        monkeypatch.setattr(tq, "_ERROR_RETRY_MAX", 0.02)

        worker = asyncio.create_task(tq._worker())
        await asyncio.sleep(0.12)
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

        assert r.calls > 1, "a transient error must keep the worker retrying"
        cache.clear_redis_degraded()

    async def test_submit_raises_rather_than_accepting_work_it_cannot_queue(self, monkeypatch):
        from services import cache

        cache.clear_redis_degraded()
        r = self._quota_redis()
        monkeypatch.setattr(tq, "get_redis", lambda: r)

        with pytest.raises(tq.TaskQueueUnavailableError):
            await tq.submit("some_task", {"x": 1})
        cache.clear_redis_degraded()

    async def test_get_task_degrades_to_none(self, monkeypatch):
        from services import cache

        cache.clear_redis_degraded()
        monkeypatch.setattr(tq, "get_redis", lambda: self._quota_redis())
        assert await tq.get_task("whatever") is None
        cache.clear_redis_degraded()
