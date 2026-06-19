import asyncio

import structlog
from fastapi import APIRouter, Request
from langchain_groq import ChatGroq

from llm_cache import invoke_with_retry
from models.requests import IncidentReportRequest
from services.rate_limiter import rate_ok
from services.session import get_session, _UUID_RE

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/incident-report")
async def incident_report_endpoint(req: IncidentReportRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not rate_ok("summary", client_ip):
        return {"error": "Rate limit exceeded — slow down"}

    session = await get_session(req.session_id)
    if not session:
        return {"error": "Session not found"}

    finding = req.finding
    outcome = req.outcome
    messages = req.crisis_messages

    timeline = "\n".join(
        f"  [{m.get('role', '?')}]: {m.get('text', '')[:200]}"
        for m in messages[:20]
    ) or "  (no crisis messages recorded)"

    outcome_str = "CONTAINED — team issued statement before reporter published" if outcome == "resolved" \
        else "LEAKED — reporter published before team responded" if outcome == "leaked" \
        else "UNKNOWN"

    prompt = f"""You are a security incident response manager. Generate a complete incident report.

Repository: {session.get('repo_name', 'Unknown')}
Incident: {finding.get('title', 'Security Vulnerability')}
Severity: {finding.get('severity', 'unknown').upper()}
File: {finding.get('file', 'unknown')}  Line: {finding.get('line_start', '?')}
Description: {finding.get('description') or finding.get('exploit_story', '')[:300]}
Crisis Outcome: {outcome_str}

Crisis Timeline:
{timeline}

Generate a professional incident report with these exact sections:

## INCIDENT SUMMARY
One paragraph: what happened, what was exposed, who was affected, outcome.

## TIMELINE
Bullet points with timestamps in relative format (T+0m, T+5m, etc):
- Discovery
- Escalation
- Crisis response
- Resolution/Publication

## IMPACT ASSESSMENT
- Data/systems at risk
- Estimated exposure window
- Affected users/services

## STAKEHOLDER COMMUNICATION
Draft a 3-sentence external statement suitable for posting (factual, calm, no admission of negligence).

## REMEDIATION CHECKLIST
- [ ] Immediate actions (0-24h)
- [ ] Short-term (1-7 days)
- [ ] Long-term (1-4 weeks)

## LESSONS LEARNED
2-3 bullet points on what to improve.

Be specific and professional. Use the actual vulnerability details."""

    def _generate() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2)
        return invoke_with_retry(llm, prompt).content.strip()

    try:
        report = await asyncio.to_thread(_generate)
        logger.info("Incident report generated", session=req.session_id, outcome=outcome)
        return {
            "report": report,
            "outcome": outcome,
            "finding": finding.get("title", ""),
            "repo": session.get("repo_name", ""),
        }
    except Exception as exc:
        logger.error("Incident report failed", error=str(exc))
        return {"error": "Incident report generation failed"}
