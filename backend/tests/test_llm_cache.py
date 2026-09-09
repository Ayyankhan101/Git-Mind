"""Tests for the Redis/diskcache LLM response cache.

get_cached/set_cached are plain sync functions. Regression coverage for a
real bug: they used to call services.cache.get_redis() (an async
redis.asyncio client) from sync code — calling .get()/.set() on it doesn't
raise, it silently hands back an unawaited coroutine object, which is
truthy and not None, so a real cache miss looked like a hit and blew up
downstream trying to json.loads() a coroutine. These tests use a real
sync-style fake (with actual storage) so a client that returns coroutines
instead of values would fail loudly here instead of degrading agents
silently in production.
"""

import pytest

from core import llm_cache


class FakeSyncRedis:
    """Minimal sync Redis stand-in (string get/set) with real storage."""

    def __init__(self):
        self.kv: dict[str, str] = {}

    def ping(self):
        return True

    def get(self, key):
        return self.kv.get(key)

    def set(self, key, value, ex=None):
        self.kv[key] = value
        return True


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Fresh diskcache dir + no Redis by default, per test."""
    import diskcache

    monkeypatch.setattr(llm_cache, "_cache", diskcache.Cache(str(tmp_path)))
    monkeypatch.setattr(llm_cache, "_sync_redis", None)
    monkeypatch.setattr(llm_cache, "_sync_redis_checked", True)
    yield


class TestGetCachedSetCached:
    def test_miss_returns_none(self):
        assert llm_cache.get_cached("model-a", "prompt that was never cached") is None

    def test_diskcache_roundtrip_without_redis(self):
        llm_cache.set_cached("model-a", "hello", "the response")
        result = llm_cache.get_cached("model-a", "hello")
        assert result == "the response"
        assert isinstance(result, str)

    def test_redis_hit_returns_plain_string_not_a_coroutine(self, monkeypatch):
        fake = FakeSyncRedis()
        monkeypatch.setattr(llm_cache, "_sync_redis", fake)
        llm_cache.set_cached("model-b", "prompt", "cached response")

        result = llm_cache.get_cached("model-b", "prompt")

        assert result == "cached response"
        assert isinstance(result, str), (
            "get_cached must return a plain string or None — never anything "
            "un-awaited/coroutine-shaped, or callers doing json.loads(result) crash"
        )

    def test_diskcache_hit_backfills_redis(self, monkeypatch):
        fake = FakeSyncRedis()
        monkeypatch.setattr(llm_cache, "_sync_redis", fake)
        # Populate diskcache only (bypass set_cached's Redis write)
        key = llm_cache._key("model-c", "prompt2")
        llm_cache._cache.set(key, "disk-only response")

        result = llm_cache.get_cached("model-c", "prompt2")

        assert result == "disk-only response"
        assert fake.kv.get(llm_cache._redis_key(key)) == "disk-only response"

    def test_redis_read_error_falls_back_to_diskcache(self, monkeypatch):
        class BoomRedis:
            def get(self, key):
                raise ConnectionError("redis down")

        monkeypatch.setattr(llm_cache, "_sync_redis", BoomRedis())
        llm_cache._cache.set(llm_cache._key("model-d", "p"), "fallback value")

        result = llm_cache.get_cached("model-d", "p")
        assert result == "fallback value"

    def test_set_cached_writes_both_backends(self, monkeypatch):
        fake = FakeSyncRedis()
        monkeypatch.setattr(llm_cache, "_sync_redis", fake)

        llm_cache.set_cached("model-e", "p", "resp")

        assert llm_cache._cache.get(llm_cache._key("model-e", "p")) == "resp"
        assert fake.kv.get(llm_cache._redis_key(llm_cache._key("model-e", "p"))) == "resp"


class TestGetSyncRedis:
    def test_returns_none_without_redis_url(self, monkeypatch):
        monkeypatch.setattr(llm_cache, "_sync_redis_checked", False)
        monkeypatch.delenv("REDIS_URL", raising=False)
        assert llm_cache._get_sync_redis() is None

    def test_caches_the_check_result(self, monkeypatch):
        monkeypatch.setattr(llm_cache, "_sync_redis_checked", False)
        monkeypatch.delenv("REDIS_URL", raising=False)
        first = llm_cache._get_sync_redis()
        # Even if REDIS_URL appears afterwards, the check already ran once.
        monkeypatch.setenv("REDIS_URL", "redis://example.invalid:6379")
        second = llm_cache._get_sync_redis()
        assert first is second is None
