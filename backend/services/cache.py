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
        raise RuntimeError(f"Redis unreachable after {_MAX_RETRIES} retries — REQUIRE_REDIS=true, refusing to start")
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


# ── Live-but-failing Redis ────────────────────────────────────────────────────
# There is a third state beyond "connected" and "not configured": a client that
# connected fine and then rejects every operation. A managed Redis that has run
# out of its request quota behaves exactly this way — get_redis() hands back a
# healthy client object and each command raises.
#
# Every `if get_redis():` guard in this codebase was written for the None case,
# so that third state used to escape as an unhandled exception from whatever
# call site touched Redis next. In production it took down the analysis
# WebSocket mid-run, because ws/analyze.py's single-flight lock — documented in
# place as "an optimization, not a correctness requirement" — raised straight
# through the handler.

_QUOTA_MARKERS = (
    "max requests limit exceeded",
    "max daily request limit",
    "quota exceeded",
    "exceeded the maximum",
)

_degraded_reason: str | None = None


def is_quota_error(exc: BaseException) -> bool:
    """Whether `exc` is a hard usage cap rather than a transient failure.

    Worth separating: a network blip is worth retrying in a second, a monthly
    request cap is not. Polling a hard cap on a timer is what kept the
    production quota pinned at 100% and buried every other log line under
    retry warnings.
    """
    text = str(exc).lower()
    return any(marker in text for marker in _QUOTA_MARKERS)


def redis_degraded() -> str | None:
    """Reason Redis is rejecting operations, or None if it is healthy.

    Distinct from `get_redis() is None`, which means Redis was never configured.
    """
    return _degraded_reason


def mark_redis_degraded(exc: BaseException, label: str = "redis operation") -> None:
    """Latch the degraded state, logging once per episode rather than per call.

    `label` names the operation that first tripped it, which is the difference
    between a log that says what broke and 567 identical lines that do not.
    """
    global _degraded_reason
    reason = "quota exhausted" if is_quota_error(exc) else "operations failing"
    if _degraded_reason == reason:
        return
    _degraded_reason = reason
    logger.warning("Redis degraded", reason=reason, first_failure=label, error=str(exc)[:160])


def clear_redis_degraded() -> None:
    global _degraded_reason
    if _degraded_reason is not None:
        logger.info("Redis recovered", previous_reason=_degraded_reason)
        _degraded_reason = None


async def redis_op(label: str, fn, *args, default=None, **kwargs):
    """Run one Redis command, degrading to `default` instead of raising.

    Use this at every call site where Redis is an optimization — caches, locks,
    de-duplication — so that "Redis is broken" degrades the feature instead of
    failing the request.

    `fn` is a bound method on the caller's own client (e.g. `r.set`). This
    deliberately does not look the client up itself: callers already hold one,
    and re-resolving it here would ignore the client they passed and silently
    bypass the operation entirely.

    Honours REQUIRE_REDIS: when that is set the caller has asked to fail closed,
    so the exception is re-raised rather than swallowed. CancelledError always
    propagates; swallowing it would break task shutdown.
    """
    try:
        result = await fn(*args, **kwargs)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        mark_redis_degraded(exc, label)
        if _REQUIRE_REDIS:
            raise
        return default
    clear_redis_degraded()
    return result
