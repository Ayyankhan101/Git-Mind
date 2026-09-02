"""Redis write-path tests.

services.cache hands out a redis.asyncio client, so every call on it returns a
coroutine that does nothing until awaited. Four write paths were plain `def`
and dropped that coroutine on the floor — silently, because the fire-and-forget
call looks identical to a successful one. With no REDIS_URL in CI, every test
took the in-memory fallback and none of it was ever exercised.

These tests run the write paths against a Redis client that actually stores,
so they assert round-trip behavior: what went in must come back out.
"""

import asyncio

import pytest

from services import cache, task_queue
from services import session as session_svc


class FakeRedis:
    """Minimal async Redis stand-in with real storage.

    Deliberately stores values rather than recording calls — a test that only
    counted `set()` invocations would pass just as happily against the
    un-awaited coroutine that caused this bug.
    """

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    async def set(self, key, value, ex=None):
        self.kv[key] = value
        return True

    async def get(self, key):
        return self.kv.get(key)

    async def lpush(self, key, *values):
        bucket = self.lists.setdefault(key, [])
        for v in values:
            bucket.insert(0, v)
        return len(bucket)

    async def brpop(self, key, timeout=0):
        bucket = self.lists.get(key) or []
        if not bucket:
            return None
        return (key, bucket.pop())

    async def ping(self):
        return True


@pytest.fixture
def fake_redis(monkeypatch):
    r = FakeRedis()
    monkeypatch.setattr(cache, "_redis", r)
    monkeypatch.setattr(session_svc, "get_redis", lambda: r)
    monkeypatch.setattr(task_queue, "get_redis", lambda: r)
    return r


# ── Session write path ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_round_trips_through_redis(fake_redis):
    """put_session must actually reach Redis.

    The un-awaited r.set() also returned early, skipping the in-memory
    fallback — so a dropped write lost the session entirely rather than
    degrading to memory.
    """
    await session_svc.put_session("sess-1", {"repo_name": "octocat/Hello-World"})

    assert "session:sess-1" in fake_redis.kv, "session was never written to Redis"
    loaded = await session_svc.get_session("sess-1")
    assert loaded is not None
    assert loaded["repo_name"] == "octocat/Hello-World"


@pytest.mark.asyncio
async def test_put_session_strips_gh_token(fake_redis):
    await session_svc.put_session("sess-2", {"repo_name": "x", "gh_token": "ghp_secret"})

    loaded = await session_svc.get_session("sess-2")
    assert "gh_token" not in loaded


# ── Task queue write path ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_enqueues_task(fake_redis):
    """A returned task_id must correspond to real queued work.

    The dropped lpush() made submit() return a valid-looking id for a job that
    would never run, and POST /analyze reported success for nothing.
    """
    task_id = await task_queue.submit("run_analysis", {"repo_url": "https://github.com/octocat/Hello-World"})

    assert task_id
    queued = fake_redis.lists.get("queue:tasks") or []
    assert len(queued) == 1, "task id was returned but nothing was enqueued"


@pytest.mark.asyncio
async def test_submitted_task_is_retrievable(fake_redis):
    task_id = await task_queue.submit("run_analysis", {"repo_url": "https://github.com/octocat/Hello-World"})

    task = await task_queue.get_task(task_id)
    assert task is not None, "task state was never persisted"
    assert task["id"] == task_id
    assert task["status"] == "pending"
    assert task["type"] == "run_analysis"


@pytest.mark.asyncio
async def test_get_task_returns_none_for_unknown_id(fake_redis):
    assert await task_queue.get_task("no-such-task") is None


# ── Regression guard ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_redis_write_paths_are_awaitable(fake_redis):
    """Every Redis write helper must be a coroutine function.

    Guards the actual defect class: a plain `def` calling the async client
    creates a coroutine that is discarded, so the write silently no-ops.
    """
    for fn in (
        session_svc.put_session,
        task_queue.submit,
        task_queue.get_task,
        task_queue._persist_task,
    ):
        assert asyncio.iscoroutinefunction(fn), f"{fn.__name__} must be async to await the Redis client"
