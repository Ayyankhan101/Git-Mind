import asyncio
import contextlib
import json
import os
import shutil
import uuid

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from agents.blame import enrich_findings_with_blame
from agents.health import compute_health
from orchestrator import graph
from services.auth import hash_token
from services.rate_limiter import check_rate_limit
from services.session import initial_state, persist_analysis, put_session
from services.sha_cache import find_cached_snapshot, get_remote_sha

logger = structlog.get_logger(__name__)

HEARTBEAT_INTERVAL = 30  # seconds
HEARTBEAT_TIMEOUT = 10  # seconds to wait for pong

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
    if not _ws_auth_secret:
        logger.warning("WS_AUTH_SECRET not set — WebSocket auth disabled. Set WS_AUTH_SECRET in production.")
    else:
        import hmac
        import time

        client_secret = payload.get("ws_auth_secret", "")
        client_ts = payload.get("ws_auth_ts", 0)
        # Reject if secret missing or timestamp older than 5 minutes (replay protection)
        if not client_secret or not hmac.compare_digest(client_secret, _ws_auth_secret):
            await ws.send_json({"error": "WebSocket auth secret mismatch"})
            await ws.close(code=1008)
            return
        if isinstance(client_ts, (int, float)) and abs(time.time() - client_ts) > 300:
            await ws.send_json({"error": "WebSocket auth token expired"})
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

    logger.info("Analysis started", session=session_id, repo=repo_url, auth=bool(gh_token))
    init = initial_state(repo_url, gh_token)
    final_state = dict(init)

    # Start heartbeat
    _heartbeat_task = asyncio.create_task(_heartbeat())

    sha = await asyncio.to_thread(get_remote_sha, repo_url)
    if sha:
        cached = await find_cached_snapshot(repo_url, sha)
        if cached:
            logger.info("Cache hit", sha=sha[:8], session=session_id)
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
                    "agent_status": {"chat": "done", "git_audit": "done", "solidity": "done", "code_audit": "done"},
                    "health": cached.get("health"),
                    "git_audit": cached.get("git_audit"),
                    "solidity_audit": cached.get("solidity_audit"),
                    "code_audit": cached.get("code_audit"),
                }
            )
            put_session(
                session_id,
                {
                    "repo_name": cached.get("repo_name", ""),
                    "chroma_collection_name": cached.get("chroma_collection_name"),
                    "security_findings": cached.get("security_findings", []),
                    "cve_findings": cached.get("cve_findings", []),
                    "api_docs": cached.get("api_docs", []),
                    "architecture_diagram": cached.get("architecture_diagram"),
                    "git_audit": cached.get("git_audit"),
                    "solidity_audit": cached.get("solidity_audit"),
                    "code_audit": cached.get("code_audit"),
                    "repo_url": repo_url,
                    "chat_history": [],
                    "owner_hash": owner_hash,
                },
            )
            await ws.send_json({"done": True, "session_id": session_id, "cached": True})
            return

    await ws.send_json({"agent_status": {"scanner": "running"}})

    astream = graph.astream(init, stream_mode="updates")  # type: ignore[attr-defined]
    _stream_deadline = time.time() + 600  # 10 min hard timeout
    try:
        async for chunk in astream:
            if time.time() > _stream_deadline:
                logger.warning("Analysis stream timed out", session=session_id)
                await ws.send_json({"error": "Analysis timed out after 10 minutes"})
                break
            if _dead.is_set():
                logger.info("Heartbeat failed, closing connection", session=session_id)
                break
            for node, update in chunk.items():
                has_error = any(ev.get("status") == "error" for ev in update.get("events", []))
                raw_statuses = _STATUS_MAP.get(node, {})
                node_statuses = (
                    {k: ("error" if v == "done" else v) for k, v in raw_statuses.items()} if has_error else raw_statuses
                )
                msg: dict = {"agent_status": node_statuses}

                for key in (
                    "architecture_diagram",
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
        await ws.send_json({"health": health_score})
        logger.info("Health score", session=session_id, grade=health_score["grade"], score=health_score["score"])
    finally:
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

    put_session(
        session_id,
        {
            "repo_name": final_state["repo_name"],
            "chroma_collection_name": final_state["chroma_collection_name"],
            "security_findings": final_state["security_findings"],
            "cve_findings": final_state.get("cve_findings", []),
            "api_docs": final_state.get("api_docs", []),
            "architecture_diagram": final_state.get("architecture_diagram"),
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
    await ws.send_json({"done": True, "session_id": session_id})
    logger.info("Analysis complete", session=session_id, repo=final_state["repo_name"])
