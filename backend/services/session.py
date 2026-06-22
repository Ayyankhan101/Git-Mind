"""Session store.

Redis mode: hashes with TTL.
Memory mode: OrderedDict (fallback).
DB fallback: SQLAlchemy persist/load for analysis snapshots.
"""
import json
import re
import time
from collections import OrderedDict

import structlog

from services.cache import get_redis

logger = structlog.get_logger(__name__)

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

_MAX_SESSIONS = 500
_SESSION_TTL = 3600  # 1 hour
_sessions: OrderedDict[str, dict] = OrderedDict()


def put_session(session_id: str, data: dict) -> None:
    """Store session data (Redis or memory)."""
    r = get_redis()
    if r:
        try:
            r.set(f"session:{session_id}", json.dumps(data, default=str), ex=_SESSION_TTL)
            return
        except Exception as exc:
            logger.warning("Redis session set failed, using memory", error=str(exc)[:80])
    _sessions[session_id] = data
    _sessions.move_to_end(session_id)
    while len(_sessions) > _MAX_SESSIONS:
        evicted = _sessions.popitem(last=False)
        logger.debug("Session evicted (LRU cap)", session_id=evicted[0])


def initial_state(repo_url: str, gh_token: str | None = None) -> dict:
    return {
        "repo_url": repo_url,
        "gh_token": gh_token,
        "local_path": None,
        "file_tree": [],
        "file_contents": {},
        "repo_name": "",
        "architecture_diagram": None,
        "api_docs": [],
        "security_findings": [],
        "chroma_collection_name": None,
        "git_audit": None,
        "chat_history": [],
        "selected_finding_id": None,
        "crisis_messages": [],
        "crisis_turn": 0,
        "public_signals": [],
        "reporter_published": False,
        "crisis_resolved": False,
        "events": [],
    }


async def get_session(session_id: str) -> dict | None:
    """Load session from Redis, then memory, then DB."""
    r = get_redis()
    if r:
        try:
            raw = await r.get(f"session:{session_id}")
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Redis session get failed", error=str(exc)[:80])

    session = _sessions.get(session_id)
    if session:
        return session

    from services.database import get_analysis_db
    restored = await get_analysis_db(session_id)
    if restored:
        put_session(session_id, restored)
        logger.info("Session restored from database", session_id=session_id)
    return restored


def _session_to_snapshot(session_id: str, final_state: dict, repo_url: str, sha: str | None, owner_hash: str | None = None) -> dict:
    import time as _time
    return {
        "repo_name": final_state["repo_name"],
        "repo_url": repo_url,
        "architecture_diagram": final_state.get("architecture_diagram"),
        "api_docs": final_state.get("api_docs", []),
        "security_findings": final_state.get("security_findings", []),
        "cve_findings": final_state.get("cve_findings", []),
        "chroma_collection_name": final_state.get("chroma_collection_name"),
        "git_audit": final_state.get("git_audit"),
        "health": final_state.get("health"),
        "head_sha": sha,
        "chat_history": final_state.get("chat_history", []),
        "owner_hash": owner_hash,
        "saved_at": _time.time(),
    }


async def persist_analysis(session_id: str, final_state: dict, repo_url: str, sha: str | None, owner_hash: str | None = None) -> None:
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
