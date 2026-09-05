import asyncio
import contextlib
import hashlib
import json
import os
import shutil
import time
import uuid

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from agents.blame import enrich_findings_with_blame
from agents.health import compute_health
from orchestrator import graph
from services.auth import hash_token, verify_ws_ticket
from services.cache import get_redis
from services.rate_limiter import check_rate_limit
from services.session import initial_state, persist_analysis, put_session
from services.sha_cache import find_cached_snapshot, get_remote_sha

logger = structlog.get_logger(__name__)

HEARTBEAT_INTERVAL = 30  # seconds
HEARTBEAT_TIMEOUT = 10  # seconds to wait for pong

# Single-flight lock: two clients hitting the same repo@sha within the same
# few seconds (double-click, two tabs, a retry racing the original) would
# otherwise both run the full 9-agent pipeline — real Groq spend for a
# duplicate result the SHA cache would have served for free once either one
# finished. The second one waits for the first instead.
_ANALYZE_LOCK_TTL = 300  # generous upper bound on one full pipeline run
_ANALYZE_LOCK_WAIT_POLL = 2
_ANALYZE_LOCK_WAIT_MAX = 240


def _analyze_lock_key(repo_url: str, sha: str) -> str:
    digest = hashlib.sha256(f"{repo_url}@{sha}".encode()).hexdigest()[:16]
    return f"lock:analyze:{digest}"


_STATUS_MAP: dict[str, dict[str, str]] = {
    "scanner": {
        "scanner": "done",
        "architecture": "running",
        "api_docs": "running",
        "security": "running",
        "chat": "running",
        "cve_scanner": "running",
        "git_audit": "running",
        "solidity": "running",
        "code_audit": "running",
    },
    "architecture": {"architecture": "done"},
    "api_docs": {"api_docs": "done"},
    "security": {"security": "done"},
    "rag_setup": {"chat": "done"},
    "cve_scanner": {"cve_scanner": "done"},
    "git_audit": {"git_audit": "done"},
    "solidity": {"solidity": "done"},
    "code_audit": {"code_audit": "done"},
}


async def handle_analyze(ws: WebSocket) -> None:
    await ws.accept()

    # ── Heartbeat task ────────────────────────────────────────────────────────
    _heartbeat_task: asyncio.Task | None = None
    _dead = asyncio.Event()

    async def _heartbeat():
        """Send periodic pings; close on timeout."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                try:
                    await asyncio.wait_for(ws.send_text(""), timeout=HEARTBEAT_TIMEOUT)
                except Exception:
                    _dead.set()
                    return
        except asyncio.CancelledError:
            return

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    if len(json.dumps(payload)) > 1_000_000:
        await ws.send_json({"error": "Payload too large"})
        await ws.close(code=1009)
        return

    _ws_auth_secret = os.environ.get("WS_AUTH_SECRET")
    _environment = os.environ.get("ENVIRONMENT", "production")
    if not _ws_auth_secret:
        if _environment == "production":
            logger.error("WS_AUTH_SECRET not set in production — rejecting WebSocket")
            await ws.send_json({"error": "Server configuration error"})
            await ws.close(code=1013)
            return
        logger.warning("WS_AUTH_SECRET not set — WebSocket auth disabled (dev mode)")
    else:
        client_ticket = payload.get("ws_auth_ticket", "")
        if not verify_ws_ticket(client_ticket):
            await ws.send_json({"error": "WebSocket auth ticket invalid or expired"})
            await ws.close(code=1008)
            return

    repo_url = (payload.get("repo_url") or "").strip()
    session_id = payload.get("session_id") or str(uuid.uuid4())
    gh_token = (payload.get("gh_token") or "").strip() or None
    owner_hash = hash_token(gh_token) if gh_token else None

    if not repo_url:
        await ws.send_json({"error": "repo_url is required"})
        await ws.close()
        return

    client_ip = getattr(ws.client, "host", "unknown")
    rate_key = f"{client_ip}:{owner_hash}" if owner_hash else client_ip
    if not (await check_rate_limit("analyze", rate_key))[0]:
        await ws.send_json({"error": "Rate limit exceeded", "retry_after": 60})
        await ws.close()
        return
    if not (await check_rate_limit("analyze_chat_burst", client_ip))[0]:
        await ws.send_json(
            {
                "error": "Rate limit exceeded — too many analyze/chat requests",
                "retry_after": 60,
            }
        )
        await ws.close()
        return

    logger.info("Analysis started", session=session_id, repo=repo_url, auth=bool(gh_token))
    init = initial_state(repo_url, gh_token)
    final_state = dict(init)

    # Start heartbeat
    _heartbeat_task = asyncio.create_task(_heartbeat())

    async def _replay_cached(cached: dict) -> None:
        logger.info("Cache hit", sha=sha[:8] if sha else "?", session=session_id)
        await ws.send_json(
            {
                "agent_status": {
                    "scanner": "done",
                    "architecture": "running",
                    "api_docs": "running",
                    "security": "running",
                    "chat": "running",
                    "cve_scanner": "running",
                    "git_audit": "running",
                    "solidity": "running",
                    "code_audit": "running",
                }
            }
        )
        await asyncio.sleep(0.2)
        await ws.send_json(
            {
                "agent_status": {"architecture": "done", "api_docs": "done"},
                "architecture_diagram": cached.get("architecture_diagram"),
                "architecture_graph": cached.get("architecture_graph"),
                "api_docs": cached.get("api_docs", []),
            }
        )
        await asyncio.sleep(0.15)
        await ws.send_json(
            {
                "agent_status": {"security": "done", "cve_scanner": "done"},
                "security_findings": cached.get("security_findings", []),
                "cve_findings": cached.get("cve_findings", []),
            }
        )
        await asyncio.sleep(0.1)
        await ws.send_json(
            {
                "agent_status": {
                    "chat": "done",
                    "git_audit": "done",
                    "solidity": "done",
                    "code_audit": "done",
                },
                "health": cached.get("health"),
                "git_audit": cached.get("git_audit"),
                "solidity_audit": cached.get("solidity_audit"),
                "code_audit": cached.get("code_audit"),
            }
        )
        await put_session(
            session_id,
            {
                "repo_name": cached.get("repo_name", ""),
                "chroma_collection_name": cached.get("chroma_collection_name"),
                "security_findings": cached.get("security_findings", []),
                "cve_findings": cached.get("cve_findings", []),
                "api_docs": cached.get("api_docs", []),
                "architecture_diagram": cached.get("architecture_diagram"),
                "architecture_graph": cached.get("architecture_graph"),
                "git_audit": cached.get("git_audit"),
                "solidity_audit": cached.get("solidity_audit"),
                "code_audit": cached.get("code_audit"),
                "repo_url": repo_url,
                "chat_history": [],
                "owner_hash": owner_hash,
            },
        )
        await ws.send_json({"done": True, "session_id": session_id, "cached": True})

    sha = await asyncio.to_thread(get_remote_sha, repo_url)
    if sha:
        init["sha_hint"] = sha  # lets the scanner check the clone cache (services/clone_cache.py)
        cached = await find_cached_snapshot(repo_url, sha)
        if cached:
            await _replay_cached(cached)
            return

    # Single-flight: try to become the one request that actually runs the
    # pipeline for this repo@sha. Redis absent (dev/no REDIS_URL) or sha
    # unknown (ls-remote failed) both fall through and just run — this is an
    # optimization, not a correctness requirement.
    _lock_redis = None
    _lock_key: str | None = None
    _lock_token: str | None = None
    if sha:
        _lock_redis = get_redis()
        if _lock_redis:
            candidate_key = _analyze_lock_key(repo_url, sha)
            candidate_token = str(uuid.uuid4())
            acquired = await _lock_redis.set(candidate_key, candidate_token, nx=True, ex=_ANALYZE_LOCK_TTL)
            if acquired:
                _lock_key, _lock_token = candidate_key, candidate_token
            else:
                waited = 0.0
                while waited < _ANALYZE_LOCK_WAIT_MAX:
                    await asyncio.sleep(_ANALYZE_LOCK_WAIT_POLL)
                    waited += _ANALYZE_LOCK_WAIT_POLL
                    cached = await find_cached_snapshot(repo_url, sha)
                    if cached:
                        await _replay_cached(cached)
                        return
                logger.info(
                    "Single-flight wait timed out — running independently",
                    session=session_id,
                    repo=repo_url,
                )

    async def _release_lock() -> None:
        if not (_lock_redis and _lock_key):
            return
        with contextlib.suppress(Exception):
            current = await _lock_redis.get(_lock_key)
            if current == _lock_token:
                await _lock_redis.delete(_lock_key)

    await ws.send_json({"agent_status": {"scanner": "running"}})

    astream = graph.astream(init, stream_mode="updates")  # type: ignore[attr-defined]
    _stream_deadline = time.time() + 600  # 10 min hard timeout
    try:
        async for chunk in astream:
            if time.time() > _stream_deadline:
                logger.warning("Analysis stream timed out", session=session_id)
                with contextlib.suppress(Exception):
                    await ws.send_json({"error": "Analysis timed out after 10 minutes"})
                    await ws.close()
                return
            if _dead.is_set():
                logger.info("Heartbeat failed, closing connection", session=session_id)
                with contextlib.suppress(Exception):
                    await ws.close()
                return
            for node, update in chunk.items():
                has_error = any(ev.get("status") == "error" for ev in update.get("events", []))

                if node == "scanner" and has_error:
                    # The clone/scan itself failed — nothing downstream has
                    # real data. Every other agent will report empty/default
                    # results (0 findings, "clean" health score, a
                    # plausible-sounding LLM summary with no actual code
                    # grounding it) that look like a genuine successful
                    # analysis instead of a failure. Stop immediately with a
                    # real error instead of letting that misleading output
                    # reach the user.
                    detail = next(
                        (ev.get("detail") for ev in update.get("events", []) if ev.get("status") == "error"),
                        None,
                    )
                    logger.warning("Scanner failed — aborting analysis", session=session_id, detail=detail)
                    with contextlib.suppress(Exception):
                        await ws.send_json(
                            {
                                "error": f"Could not scan this repository: {detail or 'clone failed'}",
                                "session_id": session_id,
                            }
                        )
                        await ws.close()
                    return

                raw_statuses = _STATUS_MAP.get(node, {})
                node_statuses = (
                    {k: ("error" if v == "done" else v) for k, v in raw_statuses.items()} if has_error else raw_statuses
                )
                msg: dict = {"agent_status": node_statuses}

                for key in (
                    "architecture_diagram",
                    "architecture_graph",
                    "api_docs",
                    "security_findings",
                    "cve_findings",
                    "chroma_collection_name",
                    "git_audit",
                    "solidity_audit",
                    "code_audit",
                ):
                    if key in update:
                        msg[key] = update[key]
                        final_state[key] = update[key]

                if "repo_name" in update:
                    final_state["repo_name"] = update["repo_name"]
                if "local_path" in update and update["local_path"]:
                    final_state["local_path"] = update["local_path"]

                for ev in update.get("events", []):
                    if ev.get("status") == "error":
                        msg["agent_error"] = ev
                        logger.warning("Agent error surfaced", error=ev)

                await ws.send_json(msg)

    except WebSocketDisconnect:
        logger.info("Client disconnected mid-analysis  session=%s", session_id)
        return
    except Exception as exc:
        logger.error("Analysis pipeline error", session=session_id, error=str(exc))
        with contextlib.suppress(Exception):
            await ws.send_json({"error": "Analysis failed — check server logs for details."})
            await ws.close()
        return
    else:
        local_path_for_blame = final_state.get("local_path")
        if local_path_for_blame and final_state.get("security_findings"):
            try:
                enriched = await asyncio.to_thread(
                    enrich_findings_with_blame,
                    final_state["security_findings"],
                    local_path_for_blame,
                )
                final_state["security_findings"] = enriched
                await ws.send_json({"security_findings": enriched})
                logger.info("Blame enrichment complete", session=session_id)
            except Exception as exc:
                logger.warning("Blame enrichment failed", error=str(exc))

        health_score = compute_health(
            file_contents=final_state.get("file_contents", {}),
            security_findings=final_state.get("security_findings", []),
            cve_findings=final_state.get("cve_findings", []),
            api_docs=final_state.get("api_docs", []),
            code_audit=final_state.get("code_audit"),
        )
        final_state["health"] = health_score
        with contextlib.suppress(Exception):
            await ws.send_json({"health": health_score})
        logger.info(
            "Health score",
            session=session_id,
            grade=health_score["grade"],
            score=health_score["score"],
        )
    finally:
        await _release_lock()
        if _heartbeat_task and not _heartbeat_task.done():
            _heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await _heartbeat_task
        with contextlib.suppress(Exception):
            await astream.aclose()
        local_path = final_state.get("local_path")
        if local_path:
            await asyncio.to_thread(shutil.rmtree, local_path, True)
            logger.info("Cleaned up temp dir", session=session_id, path=local_path)

    await put_session(
        session_id,
        {
            "repo_name": final_state["repo_name"],
            "chroma_collection_name": final_state["chroma_collection_name"],
            "security_findings": final_state["security_findings"],
            "cve_findings": final_state.get("cve_findings", []),
            "api_docs": final_state.get("api_docs", []),
            "architecture_diagram": final_state.get("architecture_diagram"),
            "architecture_graph": final_state.get("architecture_graph"),
            "git_audit": final_state.get("git_audit"),
            "solidity_audit": final_state.get("solidity_audit"),
            "code_audit": final_state.get("code_audit"),
            "repo_url": repo_url,
            "chat_history": [],
            "health": final_state.get("health"),
            "owner_hash": owner_hash,
        },
    )

    await persist_analysis(session_id, final_state, repo_url, sha, owner_hash)
    with contextlib.suppress(Exception):
        await ws.send_json({"done": True, "session_id": session_id})
    logger.info("Analysis complete", session=session_id, repo=final_state["repo_name"])
