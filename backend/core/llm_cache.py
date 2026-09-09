"""LLM response cache — Redis primary, diskcache fallback.

Flow: Redis → diskcache → miss.
On hit: backfill Redis from diskcache.
"""

import contextlib
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import cast

import diskcache
import redis as _redis_sync
import structlog
from pydantic import BaseModel

logger = structlog.get_logger(__name__)

_REDIS_TTL = 86_400  # 24 hours

# This module is entirely sync (DSPy programs run synchronously, called from
# agent code via thread pools) — services.cache.get_redis() hands out an
# async redis.asyncio client, which a sync caller can't await. Calling its
# .get()/.set() from here doesn't raise: it returns an unawaited coroutine
# object, which is truthy and not None, so it looked like a cache hit and
# blew up downstream trying to json.loads() a coroutine ("the JSON object
# must be str, bytes or bytearray, not coroutine"). A dedicated sync client
# avoids the mismatch entirely, same fix as qdrant_utils.py's registry.
_sync_redis: "_redis_sync.Redis | None" = None
_sync_redis_checked = False


def _get_sync_redis() -> "_redis_sync.Redis | None":
    global _sync_redis, _sync_redis_checked
    if _sync_redis_checked:
        return _sync_redis
    _sync_redis_checked = True
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        client = _redis_sync.from_url(url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5)
        client.ping()
        _sync_redis = client
    except Exception as exc:
        logger.debug("LLM cache Redis unavailable, diskcache-only: %s", str(exc)[:120])
        _sync_redis = None
    return _sync_redis


# ── Harvest telemetry (JSONL, gitignored) ────────────────────────────────────
# `run_dspy_cached` appends one record per LLM call (cache miss only):
# {sig, inputs, output}. The optimization pipeline (optimization/trainsets.py)
# reads these to build dspy.Example trainsets. The cache keys themselves are
# sha-256 hashes of the inputs, so the inputs are unrecoverable from the cache
# — this side log is the only replayable record of live calls.

# Anchored on the backend root, not on core/ — the harvest dir and the cache
# dir are addressed as backend/.dspy_harvest and backend/.llm_cache by
# .gitignore, the compose volumes, and the optimization runbooks.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_HARVEST_DIR = _BACKEND_ROOT / ".dspy_harvest"
_MAX_HARVEST_BYTES = 25 * 1024 * 1024  # rotate a log once it exceeds this


def _harvest_path(namespace: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", namespace)
    return _HARVEST_DIR / f"{safe}.jsonl"


def _record_harvest(namespace: str, sig_name: str, inputs: dict, output) -> None:
    """Append one telemetry record to the agent's harvest log.

    Best-effort: telemetry must never break the request path.
    """
    try:
        _HARVEST_DIR.mkdir(exist_ok=True)
        path = _harvest_path(namespace)
        line = json.dumps(
            {"sig": sig_name, "inputs": inputs, "output": output},
            default=str,
            ensure_ascii=False,
        )
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if path.stat().st_size > _MAX_HARVEST_BYTES:
            _trim_harvest(path)
    except Exception as exc:
        logger.debug("harvest record failed: %s", exc)


def _trim_harvest(path: Path) -> None:
    """Keep only the newest records when a harvest log grows too large."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(lines[-2_000:])
    except Exception:
        pass


# ── Diskcache setup (fallback) ───────────────────────────────────────────────

_PREFERRED_DIR = _BACKEND_ROOT / ".llm_cache"
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
    r = _get_sync_redis()
    if r:
        try:
            val = r.get(_redis_key(k))
            if val is not None:
                logger.debug("LLM cache hit (Redis) model=%s", model)
                return cast(str, val)
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
    r = _get_sync_redis()
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


def run_dspy_cached(program, cache_namespace: str, *, lm, output_field: str, fallback_lm=None, **inputs):
    """Run a DSPy program behind the existing Redis → diskcache LLM cache.

    The cache key is derived from the program signature plus the serialized
    inputs, so identical calls (same task + same data) short-circuit before
    reaching the LLM. Returns the program's typed output field as plain
    JSON-ready data (dict / list / str).

    Parameters
    ----------
    program:
        A dspy module (Predict / ChainOfThought) compiled from a signature.
    cache_namespace:
        Existing cache namespace, e.g. f"{LLM_MODEL}:security:json".
    lm:
        The dspy.LM to use for this call (per-agent temperature).
    output_field:
        Name of the signature's output field to return (e.g. "findings").
    fallback_lm:
        Optional second dspy.LM, retried once if `lm` raises. Used by the
        cheap-tier agents (api_doc, language_audit) so a cheap model that stops
        being callable degrades to the flagship instead of taking the agent
        down. `settings.get_dspy_lm_pair` builds the pair.
    inputs:
        Keyword inputs for the program.
    """
    from core.dspy_setup import dspy

    sig_name = getattr(program, "signature", type(program).__name__)
    # MIPROv2 changes a signature's instructions/demos but not its class name, so
    # a promoted program would keep hitting stale pre-optimization cache entries
    # unless the key folds in the program version. `load_program` stamps
    # `_opt_version` (registry.VERSION_ATTR) onto promoted programs; students
    # have no version ⇒ key unchanged from before optimization existed.
    version = getattr(program, "_opt_version", "")
    key = _dspy_key(sig_name, inputs, version=version)

    cached = get_cached(cache_namespace, key)
    if cached is not None:
        logger.debug("DSPy program cache hit: %s", sig_name)
        return json.loads(cached)

    try:
        with dspy.context(lm=lm):
            result = program(**inputs)
    except Exception as exc:
        if fallback_lm is None:
            raise
        logger.warning(
            "DSPy program %s failed on %s (%s) — retrying on %s",
            sig_name,
            getattr(lm, "model", "?"),
            exc,
            getattr(fallback_lm, "model", "?"),
        )
        with dspy.context(lm=fallback_lm):
            result = program(**inputs)

    payload = _to_plain(getattr(result, output_field))
    # Stored under `cache_namespace`, which the caller derives from the model it
    # *intended* to use. A fallback result therefore lands in the cheap model's
    # namespace and will be replayed for a later cheap-model call. Acceptable —
    # it is the stronger model's answer — but worth knowing before it surprises
    # someone reading cache contents.
    set_cached(cache_namespace, key, json.dumps(payload, default=str, ensure_ascii=False))
    # Misses only — we want actual LLM outputs, not replays. The harvest log is
    # named by the program's agent (stamped by the registry) when available, else
    # by the cache namespace.
    _record_harvest(getattr(program, "_agent", None) or cache_namespace, sig_name, inputs, payload)
    return payload


def _dspy_key(sig_name, inputs: dict, version: str = "") -> str:
    # Students (version "") keep the exact pre-optimization key format so existing
    # cache entries still hit; promoted programs get version-scoped keys.
    if version:
        material = f"{sig_name}::{version}::{json.dumps(inputs, sort_keys=True, default=str, ensure_ascii=False)}"
    else:
        material = f"{sig_name}::{json.dumps(inputs, sort_keys=True, default=str, ensure_ascii=False)}"
    return hashlib.sha256(material.encode()).hexdigest()


def _to_plain(value):
    """Recursively convert pydantic models / lists / dicts to JSON-safe plain data."""
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: _to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain(v) for v in value]
    return value
