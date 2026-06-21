import asyncio
import os
import time

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from agents.crisis.reporter import reporter_loop
from orchestrator import crisis_graph
from services.rate_limiter import rate_ok
from services.session import get_session, initial_state

logger = structlog.get_logger(__name__)


async def handle_crisis(ws: WebSocket) -> None:
    await ws.accept()

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    _ws_auth_secret = os.environ.get("WS_AUTH_SECRET")
    if _ws_auth_secret:
        import hmac
        if not hmac.compare_digest(payload.get("ws_auth_secret", ""), _ws_auth_secret):
            await ws.send_json({"error": "WebSocket auth secret mismatch"})
            await ws.close(code=1008)
            return

    session_id = payload.get("session_id")
    finding_id = payload.get("finding_id")

    client_ip = getattr(ws.client, "host", "unknown")
    if not rate_ok("analyze", client_ip):
        await ws.send_json({"error": "Rate limit exceeded — max 3 analyses per minute. Please wait."})
        await ws.close()
        return

    session = await get_session(session_id)

    if not session:
        await ws.send_json({"error": "Session not found. Run /ws/analyze first."})
        await ws.close()
        return

    findings = session.get("security_findings", [])
    if not findings:
        await ws.send_json({"error": "No security findings to dramatise."})
        await ws.close()
        return

    init = {
        **initial_state(""),
        "security_findings": findings,
        "selected_finding_id": finding_id or findings[0].get("id"),
        "crisis_messages": [],
        "crisis_turn": 0,
        "public_signals": [],
        "reporter_published": False,
        "crisis_resolved": False,
    }

    logger.info("Crisis started", session=session_id, finding=finding_id)

    state_ref: dict = dict(init)

    async def ws_send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    reporter_task = asyncio.create_task(reporter_loop(state_ref, ws_send))

    try:
        async for chunk in crisis_graph.astream(init, stream_mode="updates"):
            for node, update in chunk.items():
                for k in ("crisis_messages", "crisis_turn", "public_signals"):
                    if k in update:
                        if isinstance(update[k], list):
                            state_ref.setdefault(k, [])
                            state_ref[k] = state_ref[k] + update[k]
                        else:
                            state_ref[k] = update[k]

                for msg in update.get("crisis_messages", []):
                    await ws_send({
                        "agent": msg.get("agent"),
                        "kind": "message",
                        "content": msg.get("content"),
                        "turn": msg.get("turn"),
                        "timestamp": time.time(),
                    })

                if state_ref.get("reporter_published"):
                    break
            if state_ref.get("reporter_published"):
                break

        if not state_ref.get("reporter_published"):
            state_ref["crisis_resolved"] = True
            await ws_send({"kind": "resolved", "content": "Crisis contained — Legal-approved statement issued."})

    except WebSocketDisconnect:
        logger.info("Crisis client disconnected", session=session_id)
    except Exception as exc:
        logger.error("Crisis pipeline error", error=str(exc))
        await ws_send({"error": str(exc)})
    finally:
        reporter_task.cancel()
        try:
            await reporter_task
        except (asyncio.CancelledError, Exception):
            pass
        await ws_send({"kind": "end"})
        await ws.close()
