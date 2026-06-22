"""Redis client singleton with in-memory fallback.

If REDIS_URL not set or Redis unreachable → falls back to no-op stubs.
All consumers call get_redis() and check `if redis: ...`.
"""
import os
import structlog

logger = structlog.get_logger(__name__)

_redis = None
_fallback = True

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore[assignment]


async def init_redis() -> None:
    global _redis, _fallback
    url = os.getenv("REDIS_URL")
    if not url or aioredis is None:
        logger.info("Redis disabled (no REDIS_URL or redis not installed)")
        return
    try:
        _redis = aioredis.from_url(
            url,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        await _redis.ping()
        _fallback = False
        logger.info("Redis connected", url=url.split("@")[-1])
    except Exception as exc:
        logger.warning("Redis unreachable, falling back to memory", error=str(exc)[:120])
        _redis = None
        _fallback = True


async def close_redis() -> None:
    global _redis, _fallback
    if _redis:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
        _fallback = True


def get_redis():
    """Return Redis client or None (in-memory fallback mode)."""
    return _redis


def is_fallback() -> bool:
    return _fallback
