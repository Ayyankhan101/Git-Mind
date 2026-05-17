import json
import logging
import os
import re
import shutil
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse

# load_dotenv MUST run before any LangChain / OpenAI import
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio

from agents.chat import run_chat_agent
from agents.crisis.reporter import reporter_loop
from orchestrator import graph, crisis_graph

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-30s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup validation ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError(
            "GROQ_API_KEY is not set.\n"
            "Create backend/.env with:  GROQ_API_KEY=gsk_..."
        )
    logger.info("GitMind backend starting — GROQ_API_KEY present")
    yield
    logger.info("GitMind backend shutting down")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="GitMind API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session store — keyed by session_id UUID, capped at 50 entries (LRU eviction)
# Shape: {repo_name, chroma_collection_name, security_findings, chat_history}
_MAX_SESSIONS = 50
sessions: OrderedDict[str, dict] = OrderedDict()


def _put_session(session_id: str, data: dict) -> None:
    sessions[session_id] = data
    sessions.move_to_end(session_id)
    while len(sessions) > _MAX_SESSIONS:
        evicted = sessions.popitem(last=False)
        logger.debug("Session evicted (LRU cap): %s", evicted[0])


# ── Request models ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    question:   str

class SummaryRequest(BaseModel):
    session_id: str


# ── State initialiser (single source of truth for initial RepoState) ──────────

def _initial_state(repo_url: str) -> dict:
    return {
        "repo_url":               repo_url,
        "local_path":             None,
        "file_tree":              [],
        "file_contents":          {},
        "repo_name":              "",
        "architecture_diagram":   None,
        "api_docs":               [],
        "security_findings":      [],
        "chroma_collection_name": None,
        "chat_history":           [],
        "selected_finding_id":    None,
        "crisis_messages":        [],
        "crisis_turn":            0,
        "public_signals":         [],
        "reporter_published":     False,
        "crisis_resolved":        False,
        "events":                 [],
    }


# ── Agent → frontend status mapping ───────────────────────────────────────────

_STATUS_MAP: dict[str, dict[str, str]] = {
    "scanner":      {
        "scanner": "done", "architecture": "running",
        "api_docs": "running", "security": "running", "chat": "running",
    },
    "architecture": {"architecture": "done"},
    "api_docs":     {"api_docs": "done"},
    "security":     {"security": "done"},
    "rag_setup":    {"chat": "done"},
}


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@app.websocket("/ws/analyze")
async def ws_analyze(ws: WebSocket):
    await ws.accept()

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    repo_url   = (payload.get("repo_url") or "").strip()
    session_id = payload.get("session_id") or str(uuid.uuid4())

    if not repo_url:
        await ws.send_json({"error": "repo_url is required"})
        await ws.close()
        return

    logger.info("Analysis started  session=%s  repo=%s", session_id, repo_url)
    initial    = _initial_state(repo_url)
    final_state = dict(initial)

    await ws.send_json({"agent_status": {"scanner": "running"}})

    astream = graph.astream(initial, stream_mode="updates")
    try:
        async for chunk in astream:
            for node, update in chunk.items():
                msg: dict = {"agent_status": _STATUS_MAP.get(node, {})}

                # Relay result payloads to the frontend as they arrive
                for key in (
                    "architecture_diagram",
                    "api_docs",
                    "security_findings",
                    "chroma_collection_name",
                ):
                    if key in update:
                        msg[key]           = update[key]
                        final_state[key]   = update[key]

                if "repo_name" in update:
                    final_state["repo_name"] = update["repo_name"]
                if "local_path" in update and update["local_path"]:
                    final_state["local_path"] = update["local_path"]

                # Surface agent errors to the frontend without crashing the stream
                for ev in update.get("events", []):
                    if ev.get("status") == "error":
                        msg["agent_error"] = ev
                        logger.warning("Agent error surfaced: %s", ev)

                await ws.send_json(msg)

    except WebSocketDisconnect:
        logger.info("Client disconnected mid-analysis  session=%s", session_id)
        return
    except Exception as exc:
        logger.error("Analysis pipeline error  session=%s: %s", session_id, exc)
        await ws.send_json({"error": str(exc)})
        await ws.close()
        return
    finally:
        # Cancel any pending LangGraph work and delete the cloned repo
        try:
            await astream.aclose()
        except Exception:
            pass
        local_path = final_state.get("local_path")
        if local_path:
            shutil.rmtree(local_path, ignore_errors=True)
            logger.info("Cleaned up temp dir  session=%s  path=%s", session_id, local_path)

    _put_session(session_id, {
        "repo_name":              final_state["repo_name"],
        "chroma_collection_name": final_state["chroma_collection_name"],
        "security_findings":      final_state["security_findings"],
        "chat_history":           [],
    })

    await ws.send_json({"done": True, "session_id": session_id})
    logger.info("Analysis complete  session=%s  repo=%s", session_id, final_state["repo_name"])


# ── Chat endpoint ──────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    session = sessions.get(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    if not session.get("chroma_collection_name"):
        return {"error": "Knowledge base not ready — RAG setup may have failed."}

    answer = run_chat_agent(
        question=req.question,
        collection_name=session["chroma_collection_name"],
        chat_history=session["chat_history"],
        repo_name=session["repo_name"],
    )

    session["chat_history"].extend([
        {"role": "user",      "content": req.question},
        {"role": "assistant", "content": answer},
    ])

    return {"answer": answer}


# ── Streaming chat ─────────────────────────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    from agents.chat import run_chat_agent_stream

    session = sessions.get(req.session_id)

    async def generate():
        if not session:
            yield f"data: {json.dumps({'error': 'Session not found. Run /ws/analyze first.'})}\n\n"
            return
        if not session.get("chroma_collection_name"):
            yield f"data: {json.dumps({'error': 'Knowledge base not ready — RAG setup may have failed.'})}\n\n"
            return

        full_answer = ""
        async for token in run_chat_agent_stream(
            question=req.question,
            collection_name=session["chroma_collection_name"],
            chat_history=session["chat_history"],
            repo_name=session["repo_name"],
        ):
            full_answer += token
            yield f"data: {json.dumps({'token': token})}\n\n"

        session["chat_history"].extend([
            {"role": "user",      "content": req.question},
            {"role": "assistant", "content": full_answer},
        ])
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Executive summary ──────────────────────────────────────────────────────────

@app.post("/summary")
async def summary_endpoint(req: SummaryRequest):
    from chroma_utils import search_codebase
    from langchain_groq import ChatGroq

    session = sessions.get(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    collection = session.get("chroma_collection_name")
    chunks = (
        search_codebase(collection, "main entry point purpose overview README architecture", n_results=6)
        if collection else []
    )
    context = "\n\n".join(
        f"--- {c['filepath']} ---\n{c['content'][:350]}" for c in chunks
    ) or "No code context available."

    findings   = session.get("security_findings", [])
    n_critical = sum(1 for f in findings if f.get("severity") == "critical")
    n_high     = sum(1 for f in findings if f.get("severity") == "high")
    crit_names = ", ".join(
        f.get("rule") or f.get("check") or "unknown"
        for f in findings if f.get("severity") == "critical"
    )[:200]

    prompt = (
        f"Repo: {session['repo_name']}\n\n"
        f"Key code context:\n{context}\n\n"
        f"Security: {len(findings)} findings total — {n_critical} critical, {n_high} high.\n"
        + (f"Critical rules: {crit_names}\n" if n_critical else "")
        + "\nWrite exactly 3 sentences as a technical executive summary:\n"
          "1. What this codebase is and does (be specific about tech stack / purpose)\n"
          "2. Key architectural patterns\n"
          "3. Security posture — mention critical issues by name if any, else confirm clean\n\n"
          "No bullet points. No headers. Just 3 sentences. Be precise and technical."
    )

    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
    summary = llm.invoke(prompt).content.strip()
    logger.info("Summary generated for session=%s", req.session_id)
    return {
        "summary": summary,
        "stats": {"findings": len(findings), "critical": n_critical, "high": n_high},
    }


# ── Crisis WebSocket (Section 9 stretch) ──────────────────────────────────────

@app.websocket("/ws/crisis")
async def ws_crisis(ws: WebSocket):
    """
    Frontend opens this with {session_id, finding_id}. Engineering briefs first,
    then router rotates CEO/Legal/Engineering. A separate asyncio task runs the
    Reporter on a 45s timer reading public_signals.

    End conditions: reporter publishes (lost) | crisis_resolved (won) | 10 turns.
    """
    await ws.accept()

    try:
        payload = await ws.receive_json()
    except Exception:
        await ws.close(code=1003)
        return

    session_id = payload.get("session_id")
    finding_id = payload.get("finding_id")
    session    = sessions.get(session_id)

    if not session:
        await ws.send_json({"error": "Session not found. Run /ws/analyze first."})
        await ws.close()
        return

    findings = session.get("security_findings", [])
    if not findings:
        await ws.send_json({"error": "No security findings to dramatise."})
        await ws.close()
        return

    initial = {
        **_initial_state(""),
        "security_findings":   findings,
        "selected_finding_id": finding_id or findings[0].get("id"),
        "crisis_messages":     [],
        "crisis_turn":         0,
        "public_signals":      [],
        "reporter_published":  False,
        "crisis_resolved":     False,
    }

    logger.info("Crisis started session=%s finding=%s", session_id, finding_id)

    # Shared state ref the reporter loop reads concurrently
    state_ref: dict = dict(initial)

    async def ws_send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    reporter_task = asyncio.create_task(reporter_loop(state_ref, ws_send))

    try:
        async for chunk in crisis_graph.astream(initial, stream_mode="updates"):
            for node, update in chunk.items():
                # Persist into shared state for reporter
                for k in ("crisis_messages", "crisis_turn", "public_signals"):
                    if k in update:
                        if isinstance(update[k], list):
                            state_ref.setdefault(k, [])
                            state_ref[k] = state_ref[k] + update[k]
                        else:
                            state_ref[k] = update[k]

                # Stream each new agent message to frontend
                for msg in update.get("crisis_messages", []):
                    await ws_send({
                        "agent":     msg.get("agent"),
                        "kind":      "message",
                        "content":   msg.get("content"),
                        "turn":      msg.get("turn"),
                        "timestamp": __import__("time").time(),
                    })

                if state_ref.get("reporter_published"):
                    break
            if state_ref.get("reporter_published"):
                break

        if not state_ref.get("reporter_published"):
            state_ref["crisis_resolved"] = True
            await ws_send({"kind": "resolved", "content": "Crisis contained — Legal-approved statement issued."})

    except WebSocketDisconnect:
        logger.info("Crisis client disconnected session=%s", session_id)
    except Exception as exc:
        logger.error("Crisis pipeline error: %s", exc)
        await ws_send({"error": str(exc)})
    finally:
        reporter_task.cancel()
        try:
            await reporter_task
        except (asyncio.CancelledError, Exception):
            pass
        await ws_send({"kind": "end"})
        await ws.close()


# ── GitHub repo listing ────────────────────────────────────────────────────────

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,38}$')

@app.get("/repos/{username}")
async def list_repos(username: str):
    if not _USERNAME_RE.match(username):
        return {"error": "Invalid GitHub username"}

    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/users/{username}/repos",
                params={"per_page": 100, "sort": "updated"},
                headers=headers,
            )
    except httpx.TimeoutException:
        return {"error": "GitHub API timed out"}
    except httpx.RequestError as exc:
        return {"error": f"GitHub API unreachable: {exc}"}

    if resp.status_code == 404:
        return {"error": f"GitHub user '{username}' not found"}
    if resp.is_error:
        return {"error": f"GitHub API error {resp.status_code}"}

    repos = [
        {
            "name":        r["name"],
            "full_name":   r["full_name"],
            "description": r.get("description") or "",
            "language":    r.get("language") or "",
            "stars":       r["stargazers_count"],
            "url":         r["html_url"],
            "fork":        r["fork"],
            "updated_at":  r["updated_at"],
        }
        for r in resp.json()
        if not r["private"]
    ]
    logger.info("Listed %d repos for user=%s", len(repos), username)
    return {"repos": repos, "username": username}


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "running", "sessions_active": len(sessions)}
