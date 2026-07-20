"""Sliding-window rate limiter.

Redis mode: sorted sets per key, atomic Lua script.
Memory mode: in-process dict (same as before, fallback).

Exports:
    rate_ok(endpoint, key, service_key=None) -> bool
    check_rate_limit(endpoint, key) -> bool   (async wrapper)
    get_rate_limit_info(endpoint, key) -> dict (headers for 429 response)
"""

import asyncio
import os
import time
from collections import defaultdict

import structlog
from fastapi import Request

from services.cache import get_redis

logger = structlog.get_logger(__name__)

# endpoint -> (window_seconds, max_hits)
_RATE_WINDOWS: dict[str, tuple[int, int]] = {
    "summary": (60, 5),
    "chat": (60, 20),
    "fix": (60, 10),
    "pr": (60, 5),
    "pr_impact": (60, 3),
    "org_audit": (60, 3),
    "analyze": (60, 3),
    "analyze_rest": (60, 30),
    "repos": (60, 20),
    "webhook": (60, 60),
    "webhook_notify": (60, 10),
    "analysis_get": (60, 30),
    "analysis_previous": (60, 20),
    "monitor": (60, 10),
    "task": (60, 30),
}

# ── In-memory fallback ───────────────────────────────────────────────────────
_mem_data: dict[str, list[float]] = defaultdict(list)
_mem_lock = asyncio.Lock()

_SERVICE_KEY = os.getenv("GITMIND_SERVICE_KEY", "")


def _is_service_key(service_key: str | None) -> bool:
    return bool(_SERVICE_KEY) and service_key == _SERVICE_KEY


# ── Redis sorted-set sliding window ──────────────────────────────────────────

# Lua: atomic sliding window check
# KEYS[1] = sorted set key
# ARGV[1] = window (seconds)
# ARGV[2] = limit
# ARGV[3] = now (timestamp float as string)
# ARGV[4] = unique member id (timestamp + random)
# Returns: [allowed (0/1), remaining, retry_after]
_SLIDING_WINDOW_LUA = """
local key     = KEYS[1]
local window  = tonumber(ARGV[1])
local limit   = tonumber(ARGV[2])
local now     = tonumber(ARGV[3])
local member  = ARGV[4]
local cutoff  = now - window

-- remove expired
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window)
    return {1, limit - count - 1, 0}
else
    -- get oldest to calc retry_after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry = 0
    if #oldest >= 2 then
        retry = math.ceil(tonumber(oldest[2]) + window - now)
    end
    return {0, 0, retry}
end
"""


async def _redis_rate_check(endpoint: str, key: str) -> tuple[bool, int, int]:
    """Returns (allowed, remaining, retry_after_seconds)."""
    r = get_redis()
    window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
    now = time.time()
    redis_key = f"ratelimit:{endpoint}:{key}"
    member = f"{now}:{os.urandom(4).hex()}"
    try:
        result = await r.eval(
            _SLIDING_WINDOW_LUA,
            1,
            redis_key,
            str(window),
            str(limit),
            str(now),
            member,
        )
        allowed = bool(result[0])
        remaining = int(result[1])
        retry_after = int(result[2])
        return allowed, remaining, retry_after
    except Exception as exc:
        logger.warning("Redis rate check failed, falling back", error=str(exc)[:80])
        return _mem_rate_check(endpoint, key)


def _mem_rate_check(endpoint: str, key: str) -> tuple[bool, int, int]:
    window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
    now = time.time()
    bucket = f"{endpoint}:{key}"
    hits = [t for t in _mem_data[bucket] if t > now - window]
    if len(hits) >= limit:
        oldest = min(hits)
        retry = int(oldest + window - now) + 1
        return False, 0, max(retry, 1)
    hits.append(now)
    _mem_data[bucket] = hits
    # cleanup stale entries
    if len(_mem_data) > 500:
        cutoff = now - 300
        stale = [k for k, v in _mem_data.items() if not any(t > cutoff for t in v)]
        for k in stale:
            del _mem_data[k]
    return True, limit - len(hits), 0


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip
    real_ip = request.headers.get("X-Real-IP", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


# ── Public API ───────────────────────────────────────────────────────────────


def rate_ok(endpoint: str, key: str, service_key: str | None = None) -> bool:
    """Sync rate check. For sync contexts — always uses in-memory fallback.
    Prefer async check_rate_limit() for proper Redis-based distributed limiting."""
    if _is_service_key(service_key):
        return True
    return _mem_rate_check(endpoint, key)[0]


async def check_rate_limit(endpoint: str, key: str, service_key: str | None = None) -> tuple[bool, int, int]:
    """Async rate check. Returns (allowed, remaining, retry_after)."""
    if _is_service_key(service_key):
        window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
        return True, limit, 0
    r = get_redis()
    if r:
        return await _redis_rate_check(endpoint, key)
    return _mem_rate_check(endpoint, key)


async def get_rate_limit_info(endpoint: str, key: str) -> dict:
    """Return dict suitable for HTTP headers."""
    window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
    allowed, remaining, retry_after = await check_rate_limit(endpoint, key)
    return {
        "allowed": allowed,
        "limit": limit,
        "remaining": remaining,
        "window": f"{window}s",
        "retry_after": retry_after,
    }
