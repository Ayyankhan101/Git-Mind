import asyncio
import time

import structlog
from fastapi import APIRouter, Request

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry
from models.requests import SummaryRequest
from routes._errors import error_response, is_valid_gh_url
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip
from services.session import _UUID_RE, get_session
from settings import get_llm

logger = structlog.get_logger(__name__)
router = APIRouter()

_LLM = get_llm(temperature_key="analysis")

_PUBLIC_ANALYSIS_KEYS = (
    "repo_name",
    "repo_url",
    "architecture_diagram",
    "api_docs",
    "security_findings",
    "cve_findings",
    "git_audit",
    "solidity_audit",
    "code_audit",
    "health",
    "head_sha",
    "saved_at",
)


def _trim_analysis(snap: dict) -> dict:
    """Strip internal fields (owner_hash, chroma_collection_name, chat_history)."""
    return {k: snap.get(k) for k in _PUBLIC_ANALYSIS_KEYS if k in snap}


def _count_by_severity(findings: list[dict]) -> tuple[int, int]:
    critical = sum(1 for f in findings if f.get("severity") == "critical")
    high = sum(1 for f in findings if f.get("severity") == "high")
    return critical, high


def _flatten_code_audit_findings(code_audit: list | None) -> list[dict]:
    if not code_audit:
        return []
    findings: list[dict] = []
    for lang_result in code_audit:
        if isinstance(lang_result, dict):
            findings.extend(lang_result.get("findings") or [])
    return findings


def _build_summary_audit_context(session: dict) -> tuple[str, dict]:
    security = session.get("security_findings", [])
    sec_crit, sec_high = _count_by_severity(security)
    crit_names = ", ".join(
        f.get("rule") or f.get("check") or "unknown" for f in security if f.get("severity") == "critical"
    )[:200]

    git_audit = session.get("git_audit") or {}
    git_stats = git_audit.get("stats") or {}
    git_secrets = git_stats.get("secrets_found", 0)
    git_sensitive = git_stats.get("sensitive_files", 0)
    git_bad_msgs = git_stats.get("bad_messages", 0)

    solidity = session.get("solidity_audit") or {}
    sol_findings = solidity.get("findings") or []
    sol_crit, sol_high = _count_by_severity(sol_findings)
    sol_names = ", ".join(f.get("title") or "unknown" for f in sol_findings if f.get("severity") == "critical")[:200]

    code_findings = _flatten_code_audit_findings(session.get("code_audit"))
    code_crit, code_high = _count_by_severity(code_findings)
    code_names = ", ".join(f.get("title") or "unknown" for f in code_findings if f.get("severity") == "critical")[:200]

    health = session.get("health") or {}
    health_line = ""
    if health:
        health_line = (
            f"Health score: {health.get('grade', '?')} ({health.get('score', '?')}/100)"
            f" — code quality {health.get('breakdown', {}).get('code_quality', '?')}/100.\n"
        )

    audit_context = (
        f"Security: {len(security)} findings — {sec_crit} critical, {sec_high} high.\n"
        + (f"Critical security rules: {crit_names}\n" if sec_crit else "")
        + (
            f"Git audit: {git_secrets} secret(s), {git_sensitive} sensitive file(s), "
            f"{git_bad_msgs} poor commit message(s).\n"
        )
        + (
            f"Solidity: {len(sol_findings)} finding(s) — {sol_crit} critical, {sol_high} high.\n"
            + (f"Critical Solidity issues: {sol_names}\n" if sol_crit else "")
            if sol_findings
            else "Solidity: no .sol files or no findings.\n"
        )
        + (
            f"Code audit: {len(code_findings)} finding(s) — {code_crit} critical, {code_high} high.\n"
            + (f"Critical code issues: {code_names}\n" if code_crit else "")
            if code_findings
            else "Code audit: no language findings.\n"
        )
        + health_line
    )

    stats = {
        "findings": len(security),
        "critical": sec_crit,
        "high": sec_high,
        "git_secrets": git_secrets,
        "git_sensitive_files": git_sensitive,
        "solidity_findings": len(sol_findings),
        "solidity_critical": sol_crit,
        "code_audit_findings": len(code_findings),
        "code_audit_critical": code_crit,
        "health_grade": health.get("grade"),
        "health_score": health.get("score"),
    }
    return audit_context, stats


@router.post("/summary")
async def summary_endpoint(req: SummaryRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return error_response("Invalid session ID", 400)
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("summary", client_ip))[0]:
        return await rate_limit_response("summary", client_ip)

    session = await get_session(req.session_id)
    if not session:
        return error_response("Session not found. Run /ws/analyze first.", 404)

    collection = session.get("chroma_collection_name")
    chunks = (
        await asyncio.to_thread(
            search_codebase,
            collection,
            "main entry point purpose overview README architecture",
            6,
        )
        if collection
        else []
    )

    context = (
        "\n\n".join(f"--- {c['filepath']} ---\n{c['content'][:350]}" for c in chunks) or "No code context available."
    )

    audit_context, stats = _build_summary_audit_context(session)

    prompt = (
        f"Repo: {session['repo_name']}\n\n"
        f"Key code context:\n{context}\n\n"
        f"{audit_context}\n"
        "Write exactly 3 sentences as a technical executive summary:\n"
        "1. What this codebase is and does (be specific about tech stack / purpose)\n"
        "2. Key architectural patterns\n"
        "3. Overall quality posture — cover security, git hygiene, Solidity (if any), and code-audit findings; "
        "name critical issues if present, else confirm the area is clean\n\n"
        "No bullet points. No headers. Just 3 sentences. Be precise and technical."
    )

    def _gen() -> str:
        return invoke_with_retry(_LLM, prompt).content.strip()

    summary = await asyncio.to_thread(_gen)
    logger.info("Summary generated", session=req.session_id)
    return {
        "summary": summary,
        "stats": stats,
    }


@router.get("/analysis/previous")
async def get_previous_analysis(repo_url: str, exclude_session: str | None = None, request: Request = None):  # type: ignore[assignment]
    from services.auth import require_gh_token_or_service_key
    from services.database import get_previous_analysis_db

    if request:
        require_gh_token_or_service_key(request)
        client_ip = get_client_ip(request)
        if not (await check_rate_limit("analysis_previous", client_ip))[0]:
            return await rate_limit_response("analysis_previous", client_ip)

    if not is_valid_gh_url(repo_url.strip()):
        return error_response("Invalid GitHub repo URL — must be https://github.com/{owner}/{repo}", 400)

    snap = await get_previous_analysis_db(repo_url, exclude_session)
    if snap is None:
        return error_response("No previous analysis found", 404)
    return _trim_analysis(snap)


@router.get("/analysis/history")
async def get_analysis_history(repo_url: str, days: int = 0, request: Request = None):  # type: ignore[assignment]  # noqa: B008
    import time

    from services.database import get_analysis_history_db

    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("analysis_history", client_ip))[0]:
        return await rate_limit_response("analysis_history", client_ip)

    if not is_valid_gh_url(repo_url.strip()):
        return error_response("Invalid GitHub repo URL — must be https://github.com/{owner}/{repo}", 400)

    since = None
    if days > 0:
        since = time.time() - days * 86400

    history = await get_analysis_history_db(repo_url, since=since, limit=50)
    return {"history": list(reversed(history))}


@router.get("/analysis/{session_id}")
async def get_analysis(session_id: str, request: Request):
    if not _UUID_RE.match(session_id):
        return error_response("Invalid session ID", 400)

    client_ip = get_client_ip(request)
    if not (await check_rate_limit("analysis_get", client_ip))[0]:
        return await rate_limit_response("analysis_get", client_ip)

    from services.database import get_analysis_db

    snap = await get_analysis_db(session_id)
    if snap is None:
        return error_response("Analysis not found or has expired", 404)
    # Hybrid access: fresh analyses (≤24h) are public share-by-URL links;
    # older snapshots require authentication.
    if time.time() - (snap.get("saved_at") or 0) > 86400:
        from services.auth import require_gh_token_or_service_key

        require_gh_token_or_service_key(request)
    return _trim_analysis(snap)
