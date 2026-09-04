"""Redis client singleton with graceful memory fallback."""

import asyncio
import contextlib
import os

import structlog

logger = structlog.get_logger(__name__)

_redis = None
_fallback = False

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore[assignment]

_ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
_MAX_RETRIES = 3
_RETRY_DELAY = 1.0

# Phase 0 (docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md): opt-in hard requirement for
# Redis. Off by default so existing single-process deployments (e.g. the HF
# Spaces backend, which runs without Redis today) keep working unchanged.
# Flip on once Redis is actually reachable in your environment — it makes the
# rate limiter, session store, and this client fail fast instead of silently
# degrading to per-process memory, which breaks the moment there's more than
# one worker/replica.
_REQUIRE_REDIS = os.getenv("REQUIRE_REDIS", "false").strip().lower() == "true"


def redis_required() -> bool:
    """Whether REQUIRE_REDIS is set — callers should fail closed instead of
    falling back to per-process memory when Redis is unavailable."""
    return _REQUIRE_REDIS


async def init_redis() -> None:
    global _redis, _fallback
    url = os.getenv("REDIS_URL")
    if not url or aioredis is None:
        msg = "REDIS_URL not set or redis not installed"
        if _REQUIRE_REDIS:
            raise RuntimeError(msg + " — REQUIRE_REDIS=true, refusing to start in memory-fallback mode")
        if _ENVIRONMENT == "production":
            logger.warning(msg + " — production mode without Redis, using memory fallback")
        else:
            logger.warning(msg + " — falling back to memory (dev mode)")
        _fallback = True
        return

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            _redis = aioredis.from_url(
                url,
                decode_responses=True,
                max_connections=50,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )
            await _redis.ping()
            _fallback = False
            logger.info("Redis connected", url=url.split("@")[-1])
            return
        except Exception as exc:
            logger.warning(
                "Redis connection attempt failed",
                attempt=attempt,
                max_retries=_MAX_RETRIES,
                error=str(exc)[:120],
            )
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY * attempt)

    # All retries exhausted
    if _REQUIRE_REDIS:
        raise RuntimeError(
            f"Redis unreachable after {_MAX_RETRIES} retries — REQUIRE_REDIS=true, refusing to start"
        )
    if _ENVIRONMENT == "production":
        logger.warning(
            "Redis unreachable after %d retries — production mode using memory fallback",
            _MAX_RETRIES,
        )
    else:
        logger.warning("Redis unreachable — falling back to memory (dev mode)")
    _redis = None
    _fallback = True


async def close_redis() -> None:
    global _redis, _fallback
    if _redis:
        with contextlib.suppress(Exception):
            await _redis.aclose()
        _redis = None
        _fallback = True


def get_redis():
    """Return Redis client or None (dev fallback only)."""
    return _redis
