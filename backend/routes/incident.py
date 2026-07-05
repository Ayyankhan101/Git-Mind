import asyncio

import orjson
import structlog
from fastapi import APIRouter, Request

from llm_cache import invoke_with_retry
from models.requests import IncidentReportRequest
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit
from services.session import _UUID_RE, get_session
from settings import get_llm

logger = structlog.get_logger(__name__)
router = APIRouter()

_LLM = get_llm(temperature_key="incident", json_mode=True)

_INCIDENT_PROMPT = """\
You are a security incident response manager. Generate a structured incident report.

Repository: {repo_name}
Incident: {title}
Severity: {severity}
File: {file}  Line: {line}
Description: {description}
Crisis Outcome: {outcome_str}

Crisis Timeline:
{timeline}

Return a JSON object with these keys:
- "summary": one paragraph — what happened, what was exposed, who was affected, outcome
- "timeline": array of objects with "label" (T+0m, T+5m etc) and "event" (what happened)
- "impact": object with "systems_at_risk", "exposure_window", "affected_users"
- "stakeholder_statement": 3-sentence external statement (factual, calm, no admission of negligence)
- "remediation": object with "immediate" (0-24h), "short_term" (1-7d), "long_term" (1-4w)
- "lessons_learned": array of 2-3 bullet points

Be specific and professional. Use actual vulnerability details. Only valid JSON."""


@router.post("/incident-report")
async def incident_report_endpoint(req: IncidentReportRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("summary", client_ip))[0]:
        return await rate_limit_response("summary", client_ip)

    session = await get_session(req.session_id)
    if not session:
        return {"error": "Session not found"}

    finding = req.finding
    outcome = req.outcome
    messages = req.crisis_messages

    timeline = (
        "\n".join(f"  [{m.get('role', '?')}]: {m.get('text', '')[:200]}" for m in messages[:20])
        or "  (no crisis messages recorded)"
    )

    outcome_str = (
        "CONTAINED — team issued statement before reporter published"
        if outcome == "resolved"
        else "LEAKED — reporter published before team responded"
        if outcome == "leaked"
        else "UNKNOWN"
    )

    prompt = _INCIDENT_PROMPT.format(
        repo_name=session.get("repo_name", "Unknown"),
        title=finding.title or "Security Vulnerability",
        severity=finding.severity or "unknown",
        file=finding.file or "unknown",
        line=finding.line_start or "?",
        description=finding.description or finding.exploit_story or "",
        outcome_str=outcome_str,
        timeline=timeline,
    )

    def _generate() -> dict:
        raw = invoke_with_retry(_LLM, prompt).content.strip()
        parsed = orjson.loads(raw)
        return {
            "summary": str(parsed.get("summary", "")),
            "timeline": parsed.get("timeline") or [],
            "impact": parsed.get("impact") or {},
            "stakeholder_statement": str(parsed.get("stakeholder_statement", "")),
            "remediation": parsed.get("remediation") or {},
            "lessons_learned": parsed.get("lessons_learned") or [],
        }

    try:
        report = await asyncio.to_thread(_generate)
        logger.info("Incident report generated", session=req.session_id, outcome=outcome)
        return {
            "report": report,
            "outcome": outcome,
            "finding": finding.title or "",
            "repo": session.get("repo_name", ""),
        }
    except Exception as exc:
        logger.error("Incident report failed", error=str(exc))
        return {"error": "Incident report generation failed"}
