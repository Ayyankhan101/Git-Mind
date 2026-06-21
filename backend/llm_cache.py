import hashlib
import logging
import time
from pathlib import Path

import diskcache

logger = logging.getLogger(__name__)

# Prefer the project-local cache dir; fall back to /tmp if it's not writable (e.g. owned by root)
_PREFERRED_DIR = Path(__file__).parent / ".llm_cache"
try:
    _PREFERRED_DIR.mkdir(exist_ok=True)
    _test = _PREFERRED_DIR / ".write_test"
    _test.touch(); _test.unlink()
    _CACHE_DIR = _PREFERRED_DIR
except OSError:
    import tempfile
    _CACHE_DIR = Path(tempfile.gettempdir()) / "gitmind_llm_cache"
    _CACHE_DIR.mkdir(exist_ok=True)
    logger.warning("LLM cache falling back to %s (preferred dir not writable)", _CACHE_DIR)

_cache = diskcache.Cache(str(_CACHE_DIR), size_limit=2_000_000_000)  # 2 GB max


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
