import contextlib
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
    _test.touch()
    _test.unlink()
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


def invoke_with_retry(
    llm,
    prompt,
    max_retries: int = 2,
    base_delay: float = 2.0,
    use_cache: bool = True,
):
    """Invoke an LLM with exponential-backoff retry on transient errors.

    When *use_cache* is True (default), the cache is checked before calling the
    LLM and a successful response is stored for 24 hours.  Caching is only
    applied when *prompt* is a plain string or a serialisable list of dicts
    (LangChain message format).
    """
    # ── Cache lookup ───────────────────────────────────────────────────────
    model_name = getattr(llm, "model_name", getattr(llm, "model", "unknown"))
    cache_key_payload = _serialize_prompt(prompt)
    if use_cache:
        cached = get_cached(model_name, cache_key_payload)
        if cached is not None:
            logger.debug("LLM cache hit — skipping API call")
            # Return a simple object with a .content attribute so callers
            # (which all access .content) work unchanged.
            return _CachedResponse(cached)

    # ── Invoke with retry ──────────────────────────────────────────────────
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            result = llm.invoke(prompt)
            if use_cache and hasattr(result, "content"):
                with contextlib.suppress(Exception):
                    set_cached(model_name, cache_key_payload, result.content)
            return result
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(base_delay * (2**attempt))
    raise last_exc  # type: ignore[misc]


# ── Helpers ────────────────────────────────────────────────────────────────


def _serialize_prompt(prompt) -> str:
    """Best-effort serialisation of LangChain message lists for cache keys."""
    if isinstance(prompt, str):
        return prompt
    if isinstance(prompt, list):
        parts = []
        for msg in prompt:
            if hasattr(msg, "content"):
                role = getattr(msg, "role", type(msg).__name__)
                parts.append(f"{role}:{msg.content}")
            elif isinstance(msg, dict):
                parts.append(f"{msg.get('role', '?')}:{msg.get('content', '')}")
            else:
                parts.append(str(msg))
        return "\n".join(parts)
    return str(prompt)


class _CachedResponse:
    """Minimal wrapper so cached values can be accessed via .content."""

    __slots__ = ("content",)

    def __init__(self, content: str):
        self.content = content


def invoke_json_with_retry(
    llm,
    prompt,
    max_retries: int = 2,
    base_delay: float = 2.0,
    use_cache: bool = True,
):
    """Invoke an LLM expecting JSON output, with retry on parse failure.

    Calls invoke_with_retry normally. If the result fails to parse as JSON,
    retries up to *max_retries* additional times (with cache bypass on retries).
    Returns the parsed dict on success, raises on final failure.
    """
    import orjson as _orjson

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            resp = invoke_with_retry(llm, prompt, use_cache=use_cache and attempt == 0)
            return _orjson.loads(resp.content)
        except (_orjson.JSONDecodeError, Exception) as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(base_delay * (2**attempt))
    raise last_exc  # type: ignore[misc]
