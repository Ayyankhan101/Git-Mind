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
