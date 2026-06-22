import asyncio

import structlog
from fastapi import APIRouter, Request
from langchain_groq import ChatGroq

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry
from models.requests import SummaryRequest
from services.rate_limiter import rate_ok
from services.rate_limit_response import rate_limit_response
from services.session import get_session, _UUID_RE

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/summary")
async def summary_endpoint(req: SummaryRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not rate_ok("summary", client_ip):
        return await rate_limit_response("summary", client_ip)

    session = await get_session(req.session_id)
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

    findings = session.get("security_findings", [])
    n_critical = sum(1 for f in findings if f.get("severity") == "critical")
    n_high = sum(1 for f in findings if f.get("severity") == "high")
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
        return invoke_with_retry(llm, prompt).content.strip()

    summary = await asyncio.to_thread(_gen)
    logger.info("Summary generated", session=req.session_id)
    return {
        "summary": summary,
        "stats": {"findings": len(findings), "critical": n_critical, "high": n_high},
    }


@router.get("/analysis/{session_id}")
async def get_analysis(session_id: str):
    if not _UUID_RE.match(session_id):
        return {"error": "Invalid session ID"}
    from services.database import get_analysis_db
    snap = await get_analysis_db(session_id)
    if snap is None:
        return {"error": "Analysis not found or has expired"}
    try:
        return snap
    except Exception:
        return {"error": "Analysis file corrupted"}


@router.get("/analysis/previous")
async def get_previous_analysis(repo_url: str, exclude_session: str | None = None):
    from services.database import get_previous_analysis_db
    snap = await get_previous_analysis_db(repo_url, exclude_session)
    if snap is None:
        return {"error": "No previous analysis found"}
    return snap
