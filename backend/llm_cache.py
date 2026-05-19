import hashlib
import logging
import time
from pathlib import Path

import diskcache

logger = logging.getLogger(__name__)

# Absolute path relative to this file — safe regardless of where uvicorn is launched from
_CACHE_DIR = Path(__file__).parent / ".llm_cache"
_cache = diskcache.Cache(str(_CACHE_DIR))   # diskcache.Cache is thread-safe


def get_cached(model: str, prompt: str) -> str | None:
    value = _cache.get(_key(model, prompt))
    if value is not None:
        logger.debug("LLM cache hit  model=%s", model)
    return value


def set_cached(model: str, prompt: str, response: str, ttl: int = 86_400) -> None:
    _cache.set(_key(model, prompt), response, expire=ttl)


def _key(model: str, prompt: str) -> str:
    return hashlib.sha256(f"{model}::{prompt}".encode()).hexdigest()


def invoke_with_retry(llm, prompt, max_retries: int = 2, base_delay: float = 2.0):
    """Invoke an LLM with exponential-backoff retry on transient errors."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return llm.invoke(prompt)
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(base_delay * (2 ** attempt))
    raise last_exc  # type: ignore[misc]
