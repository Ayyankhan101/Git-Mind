"""Session store — Redis-only mode.

Stores session data as Redis hashes with TTL.
In dev mode (no Redis), falls back to in-memory OrderedDict.
"""

import json
import re
import time
from collections import OrderedDict

import structlog

from services.cache import get_redis, redis_required
from state import initial_state  # noqa: F401 — re-export for backward compatibility

logger = structlog.get_logger(__name__)

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

_SESSION_TTL = 3600  # 1 hour

# Dev fallback only (when Redis unavailable)
_sessions: OrderedDict[str, dict] = OrderedDict()
_session_timestamps: dict[str, float] = {}
_MAX_SESSIONS = 500


async def put_session(session_id: str, data: dict) -> None:
    """Store session data to Redis (or memory in dev mode)."""
    # Strip sensitive fields before persistence
    safe = {k: v for k, v in data.items() if k != "gh_token"}
    r = get_redis()
    if r:
        try:
            await r.set(f"session:{session_id}", json.dumps(safe, default=str), ex=_SESSION_TTL)
            return
        except Exception as exc:
            logger.warning("Redis session set failed", error=str(exc)[:80])
            if redis_required():
                raise RuntimeError("Redis session write failed — REQUIRE_REDIS=true, refusing memory fallback") from exc
    elif redis_required():
        raise RuntimeError("Redis unavailable — REQUIRE_REDIS=true, refusing memory fallback for session storage")

    # Dev fallback
    _sessions[session_id] = safe
    _session_timestamps[session_id] = time.time()
    _sessions.move_to_end(session_id)
    while len(_sessions) > _MAX_SESSIONS:
        evicted = _sessions.popitem(last=False)
        _session_timestamps.pop(evicted[0], None)
        logger.debug("Session evicted (LRU cap)", session_id=evicted[0])


def prune_expired_sessions() -> int:
    """Remove in-memory sessions that have exceeded TTL. Returns count removed."""
    now = time.time()
    expired = [sid for sid, ts in list(_session_timestamps.items()) if now - ts > _SESSION_TTL]
    for sid in expired:
        _sessions.pop(sid, None)
        _session_timestamps.pop(sid, None)
    if expired:
        logger.debug("Pruned expired in-memory sessions", count=len(expired))
    return len(expired)


async def get_session(session_id: str) -> dict | None:
    """Load session from Redis (or memory in dev mode)."""
    r = get_redis()
    if r:
        try:
            raw = await r.get(f"session:{session_id}")
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Redis session get failed, falling back to memory", error=str(exc)[:80])

    # Dev fallback
    session = _sessions.get(session_id)
    if session:
        ts = _session_timestamps.get(session_id, 0)
        if time.time() - ts > _SESSION_TTL:
            _sessions.pop(session_id, None)
            _session_timestamps.pop(session_id, None)
            logger.debug("Session expired (in-memory)", session_id=session_id)
            return None
        return session

    # DB fallback
    try:
        from services.database import get_analysis_db

        restored = await get_analysis_db(session_id)
        if restored:
            await put_session(session_id, restored)
            logger.info("Session restored from database", session_id=session_id)
        return restored
    except Exception as exc:
        logger.warning("DB session lookup failed", error=str(exc)[:120])
        return None


def _session_to_snapshot(
    _session_id: str,
    final_state: dict,
    repo_url: str,
    sha: str | None,
    owner_hash: str | None = None,
) -> dict:
    return {
        "repo_name": final_state["repo_name"],
        "repo_url": repo_url,
        "architecture_diagram": final_state.get("architecture_diagram"),
        "api_docs": final_state.get("api_docs", []),
        "security_findings": final_state.get("security_findings", []),
        "cve_findings": final_state.get("cve_findings", []),
        "chroma_collection_name": final_state.get("chroma_collection_name"),
        "git_audit": final_state.get("git_audit"),
        "solidity_audit": final_state.get("solidity_audit"),
        "code_audit": final_state.get("code_audit"),
        "health": final_state.get("health"),
        "head_sha": sha,
        "chat_history": final_state.get("chat_history", []),
        "owner_hash": owner_hash,
        "saved_at": time.time(),
        # NOTE: gh_token intentionally excluded — never persist secrets
    }


async def persist_analysis(
    session_id: str,
    final_state: dict,
    repo_url: str,
    sha: str | None,
    owner_hash: str | None = None,
) -> None:
    from services.database import persist_analysis_db
    from services.sha_cache import update_sha_index

    if not _UUID_RE.match(session_id):
        logger.warning("session_id is not a UUID, skipping persist", session_id=session_id)
        return

    try:
        snapshot = _session_to_snapshot(session_id, final_state, repo_url, sha, owner_hash)
        await persist_analysis_db(session_id, snapshot)
        if sha:
            await update_sha_index(sha, session_id)
    except Exception as exc:
        logger.warning("Could not persist analysis snapshot", error=str(exc))
