"""REQUIRE_REDIS=true fail-fast gating (Phase 0, blockers 4-6).

Default (REQUIRE_REDIS unset/false) behavior — memory fallback — is already
covered by test_rate_limiter.py, test_session.py, and existing main.py tests.
These tests cover the opt-in gate: when explicitly turned on, the same
Redis-unavailable conditions must fail closed instead of degrading silently.
"""

from unittest.mock import AsyncMock, patch

import pytest

from services import cache, rate_limiter, session


@pytest.fixture
def require_redis(monkeypatch):
    monkeypatch.setattr(cache, "_REQUIRE_REDIS", True)
    yield


class TestInitRedisFailsFast:
    async def test_raises_when_no_redis_url(self, require_redis, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        with pytest.raises(RuntimeError, match="REQUIRE_REDIS"):
            await cache.init_redis()

    async def test_raises_when_unreachable(self, require_redis, monkeypatch):
        monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1")  # nothing listening
        monkeypatch.setattr(cache, "_RETRY_DELAY", 0.0)
        with pytest.raises(RuntimeError, match="REQUIRE_REDIS"):
            await cache.init_redis()

    async def test_does_not_raise_when_gate_off(self, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        await cache.init_redis()  # should warn + fall back, not raise


class TestRateLimiterDeniesWithoutRedis:
    async def test_denies_when_redis_missing(self, require_redis, monkeypatch):
        monkeypatch.setattr(rate_limiter, "get_redis", lambda: None)
        allowed, remaining, retry_after = await rate_limiter.check_rate_limit("chat", "some-key")
        assert allowed is False
        assert remaining == 0
        assert retry_after > 0

    async def test_falls_back_to_memory_when_gate_off(self, monkeypatch):
        monkeypatch.setattr(rate_limiter, "get_redis", lambda: None)
        rate_limiter._mem_data.clear()
        allowed, _, _ = await rate_limiter.check_rate_limit("chat", "gate-off-key")
        assert allowed is True

    async def test_denies_on_redis_error(self, require_redis, monkeypatch):
        class BoomRedis:
            async def eval(self, *a, **kw):
                raise ConnectionError("redis down")

        monkeypatch.setattr(rate_limiter, "get_redis", lambda: BoomRedis())
        allowed, _, _ = await rate_limiter.check_rate_limit("chat", "boom-key")
        assert allowed is False


class TestSessionRaisesWithoutRedis:
    async def test_put_session_raises_when_redis_missing(self, require_redis, monkeypatch):
        monkeypatch.setattr(session, "get_redis", lambda: None)
        with pytest.raises(RuntimeError, match="REQUIRE_REDIS"):
            await session.put_session("00000000-0000-0000-0000-000000000002", {"a": 1})

    async def test_put_session_raises_on_redis_error(self, require_redis, monkeypatch):
        class BoomRedis:
            async def set(self, *a, **kw):
                raise ConnectionError("redis down")

        monkeypatch.setattr(session, "get_redis", lambda: BoomRedis())
        with pytest.raises(RuntimeError, match="REQUIRE_REDIS"):
            await session.put_session("00000000-0000-0000-0000-000000000003", {"a": 1})

    async def test_falls_back_to_memory_when_gate_off(self, monkeypatch):
        monkeypatch.setattr(session, "get_redis", lambda: None)
        await session.put_session("00000000-0000-0000-0000-000000000004", {"a": 1})
        assert session._sessions.get("00000000-0000-0000-0000-000000000004") == {"a": 1}

    async def test_get_session_raises_when_redis_missing_and_db_misses(self, require_redis, monkeypatch):
        monkeypatch.setattr(session, "get_redis", lambda: None)
        with (
            patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=None),
            pytest.raises(RuntimeError, match="REQUIRE_REDIS"),
        ):
            await session.get_session("00000000-0000-0000-0000-000000000005")

    async def test_get_session_raises_on_redis_error_when_db_misses(self, require_redis, monkeypatch):
        class BoomRedis:
            async def get(self, *a, **kw):
                raise ConnectionError("redis down")

        monkeypatch.setattr(session, "get_redis", lambda: BoomRedis())
        with (
            patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=None),
            pytest.raises(RuntimeError, match="REQUIRE_REDIS"),
        ):
            await session.get_session("00000000-0000-0000-0000-000000000006")

    async def test_get_session_recovers_from_db_despite_redis_down(self, require_redis, monkeypatch):
        monkeypatch.setattr(session, "get_redis", lambda: None)
        db_snap = {"repo_name": "recovered", "chat_history": []}
        with patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=db_snap):
            result = await session.get_session("00000000-0000-0000-0000-000000000007")
        assert result["repo_name"] == "recovered"
