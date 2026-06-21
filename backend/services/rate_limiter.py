import asyncio
import time
from collections import defaultdict

_rate_data: dict[str, list[float]] = defaultdict(list)
_rate_lock = asyncio.Lock()

_RATE_WINDOWS: dict[str, tuple[int, int]] = {
    "summary": (60, 5),
    "chat": (60, 20),
    "fix": (60, 10),
    "pr": (60, 5),
    "pr_impact": (60, 3),
    "org_audit": (60, 3),
    "analyze": (60, 3),
}


def rate_ok(endpoint: str, key: str) -> bool:
    """Sync rate check for use in sync route handlers."""
    window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
    now = time.time()
    bucket = f"{endpoint}:{key}"
    hits = [t for t in _rate_data[bucket] if t > now - window]
    if len(hits) >= limit:
        return False
    hits.append(now)
    _rate_data[bucket] = hits
    if len(_rate_data) > 500:
        cutoff = now - 300
        stale = [k for k, v in _rate_data.items() if not any(t > cutoff for t in v)]
        for k in stale:
            del _rate_data[k]
    return True


async def check_rate_limit(endpoint: str, key: str) -> bool:
    """Async rate check for use in async route handlers."""
    async with _rate_lock:
        return rate_ok(endpoint, key)
