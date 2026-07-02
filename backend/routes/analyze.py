import asyncio
import contextlib
import re
import shutil
import uuid

import structlog
from fastapi import APIRouter, Request

from agents.blame import enrich_findings_with_blame
from agents.health import compute_health
from models.requests import AnalyzeRequest
from orchestrator import graph
from services.auth import get_service_key, hash_token
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit
from services.session import initial_state, persist_analysis, put_session
from services.sha_cache import find_cached_snapshot, get_remote_sha

logger = structlog.get_logger(__name__)
router = APIRouter()

_GH_URL_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?$")


async def _run_analysis(repo_url: str, gh_token: str | None, session_id: str) -> dict:
    """Run the full analysis pipeline and return results dict."""
    owner_hash = hash_token(gh_token) if gh_token else None

    init = initial_state(repo_url, gh_token)
    final_state = dict(init)

    sha = await asyncio.to_thread(get_remote_sha, repo_url)
    if sha:
        cached = await find_cached_snapshot(repo_url, sha)
        if cached:
            logger.info("Cache hit (REST)", sha=sha[:8], session=session_id)
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
                    "repo_url": repo_url,
                    "chat_history": [],
                    "health": cached.get("health"),
                    "owner_hash": owner_hash,
                },
            )
            return {
                "session_id": session_id,
                "cached": True,
                "health": cached.get("health"),
                "repo_name": cached.get("repo_name", ""),
            }

    astream = graph.astream(init, stream_mode="updates")
    try:
        async for chunk in astream:
            for _node, update in chunk.items():
                for key in (
                    "architecture_diagram",
                    "api_docs",
                    "security_findings",
                    "cve_findings",
                    "chroma_collection_name",
                    "git_audit",
                ):
                    if key in update:
                        final_state[key] = update[key]
                if "repo_name" in update:
                    final_state["repo_name"] = update["repo_name"]
                if "local_path" in update and update["local_path"]:
                    final_state["local_path"] = update["local_path"]
    except Exception as exc:
        logger.error("REST analysis pipeline error", session=session_id, error=str(exc))
        return {"session_id": session_id, "cached": False, "error": str(exc)[:500]}
    finally:
        with contextlib.suppress(Exception):
            await astream.aclose()

    local_path_for_blame = final_state.get("local_path")
    if local_path_for_blame and final_state.get("security_findings"):
        try:
            enriched = await asyncio.to_thread(
                enrich_findings_with_blame,
                final_state["security_findings"],
                local_path_for_blame,
            )
            final_state["security_findings"] = enriched
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

    local_path = final_state.get("local_path")
    if local_path:
        await asyncio.to_thread(shutil.rmtree, local_path, True)

    put_session(
        session_id,
        {
            "repo_name": final_state["repo_name"],
            "chroma_collection_name": final_state.get("chroma_collection_name"),
            "security_findings": final_state.get("security_findings", []),
            "cve_findings": final_state.get("cve_findings", []),
            "api_docs": final_state.get("api_docs", []),
            "architecture_diagram": final_state.get("architecture_diagram"),
            "git_audit": final_state.get("git_audit"),
            "solidity_audit": final_state.get("solidity_audit"),
            "code_audit": final_state.get("code_audit"),
            "repo_url": repo_url,
            "chat_history": [],
            "health": health_score,
            "owner_hash": owner_hash,
        },
    )

    await persist_analysis(session_id, final_state, repo_url, sha, owner_hash)
    logger.info("REST analysis complete", session=session_id, repo=final_state["repo_name"])

    return {
        "session_id": session_id,
        "cached": False,
        "health": health_score,
        "repo_name": final_state["repo_name"],
    }


@router.post("/analyze")
async def analyze_endpoint(req: AnalyzeRequest, request: Request):
    repo_url = req.repo_url.strip()
    gh_token = (req.gh_token or "").strip() or None

    if not _GH_URL_RE.match(repo_url):
        return {"error": "Invalid GitHub URL — must be https://github.com/{owner}/{repo}"}

    client_ip = request.client.host if request.client else "unknown"
    service_key = get_service_key(request)
    if not (await check_rate_limit("analyze_rest", client_ip, service_key=service_key))[0]:
        return await rate_limit_response("analyze_rest", client_ip)

    session_id = str(uuid.uuid4())

    logger.info("REST analysis triggered", session=session_id, repo=repo_url, auth=bool(gh_token))

    try:
        from services.task_queue import submit

        task_id = submit(lambda: _run_analysis(repo_url, gh_token, session_id))
        return {"task_id": task_id, "session_id": session_id}
    except Exception as exc:
        logger.error("Failed to submit analysis task", error=str(exc))
        return {"error": "Failed to submit analysis — try again later"}
