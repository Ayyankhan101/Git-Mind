"""LLM response cache — Redis primary, diskcache fallback.

Flow: Redis → diskcache → miss.
On hit: backfill Redis from diskcache.
"""

import contextlib
import hashlib
import structlog
import time
from pathlib import Path

import diskcache

from services.cache import get_redis

logger = structlog.get_logger(__name__)

_REDIS_TTL = 86_400  # 24 hours

# ── Diskcache setup (fallback) ───────────────────────────────────────────────

_PREFERRED_DIR = Path(__file__).parent / ".llm_cache"
try:
    _PREFERRED_DIR.mkdir(exist_ok=True)
    _test = _PREFERRED_DIR / ".write_test"
    _test.touch()
    _test.unlink()
    _CACHE_DIR = _PREFERRED_DIR
except OSError:
    import tempfile

    _CACHE_DIR = Path(tempfile.gettempdir()) / "gitmind_llm_cache"
    _CACHE_DIR.mkdir(exist_ok=True)
    logger.warning("LLM cache falling back to %s (preferred dir not writable)", _CACHE_DIR)

_cache = diskcache.Cache(str(_CACHE_DIR), size_limit=2_000_000_000)  # 2 GB max


def _key(model: str, prompt: str) -> str:
    return hashlib.sha256(f"{model}::{prompt}".encode()).hexdigest()


def _redis_key(key: str) -> str:
    return f"llmcache:{key}"


def get_cached(model: str, prompt: str) -> str | None:
    """Check Redis first, then diskcache."""
    k = _key(model, prompt)

    # Redis check
    r = get_redis()
    if r:
        try:
            val = r.get(_redis_key(k))
            if val is not None:
                logger.debug("LLM cache hit (Redis) model=%s", model)
                return val
        except Exception as exc:
            logger.debug("Redis LLM cache read failed: %s", exc)

    # Diskcache check
    value = _cache.get(k)
    if value is not None:
        logger.debug("LLM cache hit (diskcache) model=%s", model)
        # Backfill Redis
        if r:
            with contextlib.suppress(Exception):
                r.set(_redis_key(k), value, ex=_REDIS_TTL)
        return value

    return None


def set_cached(model: str, prompt: str, response: str, ttl: int = 86_400) -> None:
    """Write to Redis and diskcache."""
    k = _key(model, prompt)

    # Write to diskcache
    _cache.set(k, response, expire=ttl)

    # Write to Redis
    r = get_redis()
    if r:
        try:
            r.set(_redis_key(k), response, ex=min(ttl, _REDIS_TTL))
        except Exception as exc:
            logger.debug("Redis LLM cache write failed: %s", exc)


def invoke_with_retry(llm, prompt, max_retries: int = 2, base_delay: float = 2.0):
    """Invoke an LLM with exponential-backoff retry on transient errors."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return llm.invoke(prompt)
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(base_delay * (2**attempt))
    raise last_exc  # type: ignore[misc]
