"""Shared rate limit response helper."""
from fastapi.responses import JSONResponse

from services.rate_limiter import get_rate_limit_info


async def rate_limit_response(endpoint: str, key: str) -> JSONResponse:
    """Return proper HTTP 429 with Retry-After and rate limit headers."""
    info = await get_rate_limit_info(endpoint, key)
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "retry_after": info["retry_after"],
            "limit": info["limit"],
            "window": info["window"],
        },
        headers={
            "Retry-After": str(info["retry_after"]),
            "X-RateLimit-Limit": str(info["limit"]),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Window": info["window"],
        },
    )
