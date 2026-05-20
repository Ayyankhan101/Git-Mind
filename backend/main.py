import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from collections import OrderedDict, defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

import asyncio
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

_ANALYSES_DIR = Path(__file__).parent / "analyses"
_ANALYSES_DIR.mkdir(exist_ok=True)

_SHA_INDEX_PATH = _ANALYSES_DIR / "_sha_index.json"
_sha_index_lock = threading.Lock()

def _get_remote_sha(repo_url: str) -> str | None:
    """Return HEAD commit SHA via git ls-remote without cloning (~1 s)."""
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--quiet", "--exit-code", repo_url, "HEAD"],
            capture_output=True, text=True, timeout=10, shell=False,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout.split()[0]
    except Exception:
        pass
    return None

def _load_sha_index() -> dict:
    try:
        return json.loads(_SHA_INDEX_PATH.read_text())
    except Exception:
        return {}

def _save_sha_index(idx: dict) -> None:
    try:
        tmp = _SHA_INDEX_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(idx))
        tmp.replace(_SHA_INDEX_PATH)
    except Exception:
        pass

def _find_cached_snapshot(repo_url: str, sha: str) -> dict | None:
    idx = _load_sha_index()
    sid = idx.get(sha)
    if not sid:
        return None
    path = _ANALYSES_DIR / f"{sid}.json"
    if not path.exists():
        return None
    try:
        snap = json.loads(path.read_text())
        if snap.get("repo_url") == repo_url:
            return snap
    except Exception:
        pass
    return None

# load_dotenv MUST run before any LangChain / OpenAI import
load_dotenv()

from agents.blame import enrich_findings_with_blame
from agents.chat import run_chat_agent
from agents.crisis.reporter import reporter_loop
from agents.health import compute_health
from orchestrator import graph, crisis_graph

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-30s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup validation ─────────────────────────────────────────────────────────

_ANALYSIS_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

def _prune_old_analyses() -> None:
    cutoff = time.time() - _ANALYSIS_TTL_SECONDS
    removed = 0
    removed_ids: set[str] = set()
    for p in _ANALYSES_DIR.glob("*.json"):
        if p.name == "_sha_index.json":
            continue
        try:
            if p.stat().st_mtime < cutoff:
                removed_ids.add(p.stem)
                p.unlink()
                removed += 1
        except Exception:
            pass
    if removed:
        logger.info("Pruned %d expired analysis file(s)", removed)
    if removed_ids:
        with _sha_index_lock:
            idx = _load_sha_index()
            cleaned = {sha: sid for sha, sid in idx.items() if sid not in removed_ids}
            if len(cleaned) < len(idx):
                _save_sha_index(cleaned)
                logger.info("Pruned %d stale SHA index entries", len(idx) - len(cleaned))

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError(
            "GROQ_API_KEY is not set.\n"
            "Create backend/.env with:  GROQ_API_KEY=gsk_..."
        )
    await asyncio.to_thread(_prune_old_analyses)
    # Prune ChromaDB collections older than 7 days
    try:
        from chroma_utils import prune_old_collections
        removed = await asyncio.to_thread(prune_old_collections)
        if removed:
            logger.info("Startup: pruned %d old ChromaDB collection(s)", removed)
    except Exception as exc:
        logger.warning("Could not prune old collections: %s", exc)
    logger.info("GitMind backend starting — GROQ_API_KEY present")
    yield
    logger.info("GitMind backend shutting down")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="GitMind API", lifespan=lifespan)

_CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session store — keyed by session_id UUID, capped at 50 entries (LRU eviction)
# Shape: {repo_name, chroma_collection_name, security_findings, chat_history, ...}
_MAX_SESSIONS = 50
sessions: OrderedDict[str, dict] = OrderedDict()


def _put_session(session_id: str, data: dict) -> None:
    sessions[session_id] = data
    sessions.move_to_end(session_id)
    while len(sessions) > _MAX_SESSIONS:
        evicted = sessions.popitem(last=False)
        logger.debug("Session evicted (LRU cap): %s", evicted[0])


# ── Simple rate limiter ────────────────────────────────────────────────────────
# Sliding-window per (endpoint, session_id). No external deps.

_rate_data: dict[str, list[float]] = defaultdict(list)
_rate_lock = threading.Lock()
_RATE_WINDOWS: dict[str, tuple[int, int]] = {
    "summary": (60, 5),    # 5 calls per 60 s
    "chat":    (60, 20),   # 20 calls per 60 s
    "fix":     (60, 10),   # 10 calls per 60 s
    "pr":      (60, 5),    # 5 calls per 60 s
    "analyze": (60, 3),    # 3 analyses per 60 s per IP
}

def _rate_ok(endpoint: str, key: str) -> bool:
    window, limit = _RATE_WINDOWS.get(endpoint, (60, 20))
    now = time.time()
    bucket = f"{endpoint}:{key}"
    with _rate_lock:
        hits = [t for t in _rate_data[bucket] if t > now - window]
        if len(hits) >= limit:
            return False
        hits.append(now)
        _rate_data[bucket] = hits
        return True


# ── Request models ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    question:   str

class SummaryRequest(BaseModel):
    session_id: str

class PRReviewRequest(BaseModel):
    pr_url: str
    token:  str | None = None

class FixRequest(BaseModel):
    session_id: str
    finding:    dict

class AutoPRRequest(BaseModel):
    session_id: str
    finding:    dict
    token:      str


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


# ── Lazy session restore from disk ────────────────────────────────────────────

def _restore_session_from_disk(session_id: str) -> dict | None:
    """Rebuild an in-memory session from a persisted analysis snapshot."""
    if not _UUID_RE.match(session_id):
        return None
    path = _ANALYSES_DIR / f"{session_id}.json"
    if not path.exists():
        return None
    try:
        snap = json.loads(path.read_text())
    except Exception:
        return None
    return {
        "repo_name":              snap.get("repo_name", ""),
        "chroma_collection_name": snap.get("chroma_collection_name"),
        "security_findings":      snap.get("security_findings", []),
        "cve_findings":           snap.get("cve_findings", []),
        "api_docs":               snap.get("api_docs", []),
        "architecture_diagram":   snap.get("architecture_diagram"),
        "repo_url":               snap.get("repo_url", ""),
        "chat_history":           [],
    }


def _get_session(session_id: str) -> dict | None:
    """Return session from memory, restoring from disk if needed."""
    session = sessions.get(session_id)
    if session:
        return session
    restored = _restore_session_from_disk(session_id)
    if restored:
        _put_session(session_id, restored)
        logger.info("Session restored from disk: %s", session_id)
    return restored


# ── Agent → frontend status mapping ───────────────────────────────────────────

_STATUS_MAP: dict[str, dict[str, str]] = {
    "scanner":      {
        "scanner": "done", "architecture": "running",
        "api_docs": "running", "security": "running", "chat": "running",
        "cve_scanner": "running",
    },
    "architecture": {"architecture": "done"},
    "api_docs":     {"api_docs": "done"},
    "security":     {"security": "done"},
    "rag_setup":    {"chat": "done"},
    "cve_scanner":  {"cve_scanner": "done"},
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
    sha        = None

    if not repo_url:
        await ws.send_json({"error": "repo_url is required"})
        await ws.close()
        return

    client_ip = getattr(ws.client, "host", "unknown")
    if not _rate_ok("analyze", client_ip):
        await ws.send_json({"error": "Rate limit exceeded — max 3 analyses per minute. Please wait."})
        await ws.close()
        return

    logger.info("Analysis started  session=%s  repo=%s", session_id, repo_url)
    initial    = _initial_state(repo_url)
    final_state = dict(initial)

    # ── SHA cache check ────────────────────────────────────────────────────────
    sha = await asyncio.to_thread(_get_remote_sha, repo_url)
    if sha:
        cached = _find_cached_snapshot(repo_url, sha)
        if cached:
            logger.info("Cache hit SHA=%s session=%s", sha[:8], session_id)
            # Stagger agent completions so the pipeline animates naturally on the frontend
            await ws.send_json({"agent_status": {
                "scanner": "done", "architecture": "running", "api_docs": "running",
                "security": "running", "chat": "running", "cve_scanner": "running",
            }})
            await asyncio.sleep(0.2)
            await ws.send_json({
                "agent_status": {"architecture": "done", "api_docs": "done"},
                "architecture_diagram": cached.get("architecture_diagram"),
                "api_docs":             cached.get("api_docs", []),
            })
            await asyncio.sleep(0.15)
            await ws.send_json({
                "agent_status": {"security": "done", "cve_scanner": "done"},
                "security_findings": cached.get("security_findings", []),
                "cve_findings":      cached.get("cve_findings", []),
            })
            await asyncio.sleep(0.1)
            await ws.send_json({
                "agent_status": {"chat": "done"},
                "health":        cached.get("health"),
            })
            _put_session(session_id, {
                "repo_name":              cached.get("repo_name", ""),
                "chroma_collection_name": cached.get("chroma_collection_name"),
                "security_findings":      cached.get("security_findings", []),
                "cve_findings":           cached.get("cve_findings", []),
                "api_docs":               cached.get("api_docs", []),
                "architecture_diagram":   cached.get("architecture_diagram"),
                "repo_url":               repo_url,
                "chat_history":           [],
            })
            await ws.send_json({"done": True, "session_id": session_id, "cached": True})
            return

    await ws.send_json({"agent_status": {"scanner": "running"}})

    astream = graph.astream(initial, stream_mode="updates")
    try:
        async for chunk in astream:
            for node, update in chunk.items():
                # Determine if this node completed with an error
                has_error = any(
                    ev.get("status") == "error" for ev in update.get("events", [])
                )
                raw_statuses = _STATUS_MAP.get(node, {})
                node_statuses = (
                    {k: ("error" if v == "done" else v) for k, v in raw_statuses.items()}
                    if has_error else raw_statuses
                )
                msg: dict = {"agent_status": node_statuses}

                # Relay result payloads to the frontend as they arrive
                for key in (
                    "architecture_diagram",
                    "api_docs",
                    "security_findings",
                    "cve_findings",
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
    else:
        # ── Blame enrichment (runs only on success, before finally cleanup) ──
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
                logger.info("Blame enrichment complete  session=%s", session_id)
            except Exception as exc:
                logger.warning("Blame enrichment failed: %s", exc)

        # ── Health score ───────────────────────────────────────────────────────
        health_score = compute_health(
            file_contents=final_state.get("file_contents", {}),
            security_findings=final_state.get("security_findings", []),
            cve_findings=final_state.get("cve_findings", []),
            api_docs=final_state.get("api_docs", []),
        )
        final_state["health"] = health_score
        await ws.send_json({"health": health_score})
        logger.info("Health score  session=%s  grade=%s  score=%d", session_id, health_score["grade"], health_score["score"])
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
        "cve_findings":           final_state.get("cve_findings", []),
        "api_docs":               final_state.get("api_docs", []),
        "architecture_diagram":   final_state.get("architecture_diagram"),
        "repo_url":               repo_url,
        "chat_history":           [],
        "health":                 final_state.get("health"),
    })

    # Persist analysis so it can be shared via /analysis/{session_id}
    if _UUID_RE.match(session_id):
        try:
            snapshot = {
                "session_id":             session_id,
                "repo_name":              final_state["repo_name"],
                "repo_url":               repo_url,
                "architecture_diagram":   final_state.get("architecture_diagram"),
                "api_docs":               final_state.get("api_docs", []),
                "security_findings":      final_state.get("security_findings", []),
                "cve_findings":           final_state.get("cve_findings", []),
                "chroma_collection_name": final_state.get("chroma_collection_name"),
                "health":                 final_state.get("health"),
                "head_sha":               sha,
                "saved_at":               time.time(),
            }
            (_ANALYSES_DIR / f"{session_id}.json").write_text(json.dumps(snapshot))
            # Update SHA index for instant cache on next request for same commit
            if sha:
                with _sha_index_lock:
                    idx = _load_sha_index()
                    idx[sha] = session_id
                    _save_sha_index(idx)
        except Exception as exc:
            logger.warning("Could not persist analysis snapshot: %s", exc)
    else:
        logger.warning("session_id is not a UUID, skipping persist: %s", session_id)

    await ws.send_json({"done": True, "session_id": session_id})
    logger.info("Analysis complete  session=%s  repo=%s", session_id, final_state["repo_name"])


# ── Chat endpoint ──────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    if not _rate_ok("chat", req.session_id):
        return {"error": "Rate limit exceeded — slow down"}

    session = _get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}
    if not session.get("chroma_collection_name"):
        return {"error": "Knowledge base not ready — RAG setup may have failed."}

    answer = await asyncio.to_thread(
        run_chat_agent,
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

    if not _UUID_RE.match(req.session_id):
        async def _bad():
            yield f"data: {json.dumps({'error': 'Invalid session ID'})}\n\n"
        return StreamingResponse(_bad(), media_type="text/event-stream")

    if not _rate_ok("chat", req.session_id):
        async def _limited():
            yield f"data: {json.dumps({'error': 'Rate limit exceeded — slow down'})}\n\n"
        return StreamingResponse(_limited(), media_type="text/event-stream")

    session = _get_session(req.session_id)

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

    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    if not _rate_ok("summary", req.session_id):
        return {"error": "Rate limit exceeded — slow down"}

    session = _get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    collection = session.get("chroma_collection_name")
    chunks = await asyncio.to_thread(
        search_codebase, collection,
        "main entry point purpose overview README architecture", 6,
    ) if collection else []

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

    def _gen() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
        return llm.invoke(prompt).content.strip()

    summary = await asyncio.to_thread(_gen)
    logger.info("Summary generated for session=%s", req.session_id)
    return {
        "summary": summary,
        "stats": {"findings": len(findings), "critical": n_critical, "high": n_high},
    }


# ── Shared analysis (GET) ──────────────────────────────────────────────────────

@app.get("/analysis/{session_id}")
async def get_analysis(session_id: str):
    if not _UUID_RE.match(session_id):
        return {"error": "Invalid session ID"}
    path = _ANALYSES_DIR / f"{session_id}.json"
    if not path.exists():
        return {"error": "Analysis not found or has expired"}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {"error": "Analysis file corrupted"}


# ── PR Review ──────────────────────────────────────────────────────────────────

@app.post("/pr-review")
async def pr_review_endpoint(req: PRReviewRequest):
    from agents.pr_review import run_pr_review
    if not _rate_ok("pr", req.pr_url):
        return {"error": "Rate limit exceeded — slow down"}
    token = req.token or os.getenv("GITHUB_TOKEN")
    try:
        result = await asyncio.to_thread(run_pr_review, req.pr_url, token)
        return result
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("PR review failed: %s", exc)
        return {"error": f"Review failed — {exc}"}


# ── Auto-fix generation ─────────────────────────────────────────────────────────

@app.post("/fix")
async def fix_endpoint(req: FixRequest):
    from chroma_utils import search_codebase
    from langchain_groq import ChatGroq

    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    if not _rate_ok("fix", req.session_id):
        return {"error": "Rate limit exceeded — slow down"}

    session = _get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    finding    = req.finding
    collection = session.get("chroma_collection_name")
    query      = " ".join(filter(None, [
        finding.get("rule"), finding.get("file"),
        finding.get("title"), finding.get("description", "")[:100],
    ]))

    chunks  = await asyncio.to_thread(search_codebase, collection, query, 4) if collection else []
    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks) or "No code context available."

    prompt = (
        f"Repo: {session['repo_name']}\n\n"
        f"Security finding:\n"
        f"  Rule: {finding.get('rule', 'unknown')}\n"
        f"  Severity: {finding.get('severity', 'unknown')}\n"
        f"  Title: {finding.get('title', '')}\n"
        f"  Description: {finding.get('description') or finding.get('exploit_story', '')}\n"
        f"  File: {finding.get('file', 'unknown')}  Line: {finding.get('line_start', '?')}\n\n"
        f"Relevant code:\n{context}\n\n"
        "Generate a fix for this vulnerability.\n"
        "Format your response as:\n\n"
        "**Fix explanation** (1 sentence)\n\n"
        "```diff\n"
        "--- a/path/to/file\n"
        "+++ b/path/to/file\n"
        "@@ ... @@\n"
        " context line\n"
        "-removed line\n"
        "+added line\n"
        " context line\n"
        "```\n\n"
        "Be precise. Only change what's needed to fix the vulnerability."
    )

    def _generate() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
        return llm.invoke(prompt).content.strip()

    fix = await asyncio.to_thread(_generate)
    logger.info("Fix generated for session=%s rule=%s", req.session_id, finding.get("rule"))
    return {"fix": fix, "finding_rule": finding.get("rule", "unknown")}


# ── Auto-PR helper ─────────────────────────────────────────────────────────────

def _apply_and_push_pr(
    repo_url: str,
    patch: str,
    finding: dict,
    token: str,
    repo_name: str,
) -> dict:
    import tempfile
    import re as _re
    import httpx as _httpx

    branch = f"gitmind/fix-{finding.get('id', uuid.uuid4().hex[:6])}"
    dest   = tempfile.mkdtemp(prefix="gitmind_pr_")

    try:
        auth_url = repo_url.replace("https://", f"https://x-access-token:{token}@")
        subprocess.run(
            ["git", "clone", "--depth=1", auth_url, dest],
            check=True, capture_output=True, timeout=60,
        )
        subprocess.run(["git", "config", "user.email", "gitmind@example.com"], cwd=dest, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name",  "GitMind Bot"],         cwd=dest, check=True, capture_output=True)
        subprocess.run(["git", "checkout", "-b", branch], cwd=dest, check=True, capture_output=True)

        proc = subprocess.run(
            ["patch", "-p1", "--forward"],
            input=patch, text=True, cwd=dest,
            capture_output=True, timeout=15,
        )
        if proc.returncode not in (0, 1):
            raise RuntimeError(f"patch failed: {proc.stderr[:300]}")

        subprocess.run(["git", "add", "-A"],                            cwd=dest, check=True, capture_output=True)
        msg = f"fix: {finding.get('title', 'security fix')} [{finding.get('rule','gitmind')}]"
        subprocess.run(["git", "commit", "-m", msg],                    cwd=dest, check=True, capture_output=True)
        subprocess.run(["git", "push", "origin", branch],               cwd=dest, check=True, capture_output=True, timeout=30)
    finally:
        shutil.rmtree(dest, ignore_errors=True)

    m = _re.match(r'https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$', repo_url)
    if not m:
        raise ValueError("Could not parse GitHub owner/repo from URL")
    owner, repo = m.group(1), m.group(2)

    pr_body = (
        f"## Security Fix — {finding.get('title', 'Vulnerability')}\n\n"
        f"**Severity:** {finding.get('severity','unknown').upper()}\n"
        f"**File:** `{finding.get('file','?')}` line {finding.get('line_start','?')}\n\n"
        f"**Issue:** {finding.get('exploit_story') or finding.get('description','')}\n\n"
        f"_Auto-generated by [GitMind](https://github.com) — AI-powered security remediation._"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitMind",
    }
    pr_data = {
        "title": f"fix: {finding.get('title', 'security vulnerability')}",
        "body":  pr_body,
        "head":  branch,
        "base":  "main",
    }
    resp = _httpx.post(
        f"https://api.github.com/repos/{owner}/{repo}/pulls",
        headers=headers,
        json=pr_data,
        timeout=15.0,
    )
    if resp.status_code == 422:
        pr_data["base"] = "master"
        resp = _httpx.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            json=pr_data,
            timeout=15.0,
        )
    resp.raise_for_status()
    pr = resp.json()
    return {"pr_url": pr["html_url"], "pr_number": pr["number"], "branch": branch}


# ── Auto-PR endpoint ──────────────────────────────────────────────────────────

@app.post("/fix/pr")
async def auto_pr_endpoint(req: AutoPRRequest):
    from chroma_utils import search_codebase
    from langchain_groq import ChatGroq

    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    if not _rate_ok("fix", req.session_id):
        return {"error": "Rate limit exceeded"}

    if not req.token or not req.token.strip():
        return {"error": "GitHub token is required"}

    session = _get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    repo_url = session.get("repo_url", "")
    if not repo_url.startswith("https://github.com/"):
        return {"error": "Auto-PR requires a GitHub repo"}

    finding    = req.finding
    collection = session.get("chroma_collection_name")
    query      = " ".join(filter(None, [
        finding.get("rule"), finding.get("file"),
        finding.get("title"), finding.get("description", "")[:100],
    ]))
    chunks  = await asyncio.to_thread(search_codebase, collection, query, 4) if collection else []
    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks) or "No context."

    prompt = (
        f"Security finding in {session['repo_name']}:\n"
        f"  Rule: {finding.get('rule','unknown')}  Severity: {finding.get('severity','unknown')}\n"
        f"  File: {finding.get('file','?')}  Line: {finding.get('line_start','?')}\n"
        f"  Issue: {finding.get('description') or finding.get('exploit_story','')}\n\n"
        f"Relevant code:\n{context}\n\n"
        "Output ONLY a unified diff in this exact format — no explanation, no markdown fences:\n"
        "--- a/path/to/file\n+++ b/path/to/file\n@@ ... @@\n context\n-removed\n+added\n"
    )

    def _gen_patch() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
        return llm.invoke(prompt).content.strip()

    raw_patch = await asyncio.to_thread(_gen_patch)

    try:
        result = await asyncio.to_thread(
            _apply_and_push_pr, repo_url, raw_patch, finding, req.token, session["repo_name"]
        )
        logger.info("Auto-PR created: %s", result.get("pr_url"))
        return result
    except Exception as exc:
        logger.error("Auto-PR failed: %s", exc)
        return {"error": str(exc)}


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
    session    = _get_session(session_id)

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
