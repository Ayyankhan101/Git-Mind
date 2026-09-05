import json
import shutil
import subprocess
import uuid
from pathlib import Path

import structlog
from pydantic import BaseModel

_SEMGREP = shutil.which("semgrep")

from dspy_setup import dspy  # noqa: E402
from llm_cache import run_dspy_cached  # noqa: E402
from optimization.registry import define_program  # noqa: E402
from settings import LLM_MODEL, get_dspy_lm  # noqa: E402

logger = structlog.get_logger(__name__)

_LM = get_dspy_lm(temperature_key="security")
_CACHE_NAMESPACE = f"{LLM_MODEL}:security:json"
_MAX_FINDINGS = 40
_MAX_MSG_CHARS = 300
_VALID_SEVERITIES = frozenset({"low", "medium", "high", "critical"})


class SecurityFinding(BaseModel):
    """Triaged semgrep finding — shape matches the frontend contract exactly."""

    id: str
    file: str
    line_start: int
    line_end: int
    severity: str
    title: str
    exploit_story: str
    remediation: str
    cwe: str | None = None


class SecurityTriage(dspy.Signature):
    """You are a senior application security engineer preparing an executive briefing.

    For each raw semgrep finding, produce a concise, actionable summary.
    If there are no findings, return an empty list."""

    raw_findings: str = dspy.InputField(desc="JSON array of raw semgrep findings from a static code scan")
    findings: list[SecurityFinding] = dspy.OutputField(
        desc=(
            "Triaged findings. Each has: id (short, use the check_id tail e.g. 'sql-injection'), "
            "file (relative path), line_start (int), line_end (int), severity (low|medium|high|critical), "
            "title (max 10 words), exploit_story (one non-technical sentence on real-world business impact), "
            "remediation (one concrete fix sentence), cwe (CWE identifier or null)."
        )
    )


_predictor = define_program(
    "security",
    SecurityTriage,
    output_field="findings",
    input_fields=("raw_findings",),
    output_model=SecurityFinding,
)


def run_security_agent(local_path: str) -> list[dict]:
    if not _SEMGREP:
        logger.error("semgrep not found in PATH — security scan unavailable")
        return _degraded_finding("semgrep is not installed on the server — no scan was run.")

    if not local_path:
        logger.warning("security agent called with empty local_path")
        return _degraded_finding("No local checkout was available to scan.")

    raw_results = _run_semgrep(local_path)
    if raw_results is None:
        # Distinguish "scan failed" from "scan ran, found nothing" — see
        # _run_semgrep. Silently reporting a failed scan as a clean repo is
        # actively misleading for a security tool.
        return _degraded_finding(
            "The static analysis scan timed out or failed to complete — results may be incomplete."
        )
    if not raw_results:
        logger.info("semgrep returned zero findings — repo is clean")
        return []

    return _triage_with_llm(raw_results)


# ── Private helpers ────────────────────────────────────────────────────────────


def _run_semgrep(local_path: str) -> list[dict] | None:
    """Returns raw semgrep findings, `[]` for a genuinely clean scan, or
    `None` if the scan itself failed/timed out — callers must not treat
    `None` the same as a clean repo."""
    assert _SEMGREP is not None  # run_security_agent already checked this
    posix_path = Path(local_path).as_posix()
    try:
        proc = subprocess.run(
            [
                _SEMGREP,
                "--config=auto",
                "--json",
                "--quiet",
                "--timeout",
                "30",  # per-rule timeout (seconds)
                "--timeout-threshold",
                "3",  # skip a rule after 3 file timeouts
                "--max-target-bytes",
                "524288",  # skip files > 512 KB
                posix_path,
            ],
            capture_output=True,
            text=True,
            timeout=150,  # --config=auto needs real headroom; 90s was silently truncating real scans
            shell=False,  # never shell=True with external paths
        )
        # semgrep exit 0 = no findings, exit 1 = findings found — both are success
        if proc.returncode not in (0, 1):
            logger.error(
                "semgrep exited %d — stderr: %s",
                proc.returncode,
                proc.stderr[:300],
            )
            return None
        data = json.loads(proc.stdout or '{"results":[]}')
        results = data.get("results", [])
        logger.info("semgrep returned %d raw findings", len(results))
        return results
    except subprocess.TimeoutExpired:
        logger.warning("semgrep timed out after 150 s")
        return None
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("semgrep execution error: %s", exc)
        return None


def _triage_with_llm(raw_results: list[dict]) -> list[dict]:
    truncated = [
        {
            "check_id": r["check_id"],
            "path": r["path"],
            "start": r["start"],
            "end": r["end"],
            "severity": r["extra"].get("severity", "WARNING"),
            "message": r["extra"].get("message", "")[:_MAX_MSG_CHARS],
        }
        for r in raw_results[:_MAX_FINDINGS]
    ]

    try:
        findings = run_dspy_cached(
            _predictor,
            _CACHE_NAMESPACE,
            lm=_LM,
            output_field="findings",
            raw_findings=json.dumps(truncated, indent=2),
        )
    except Exception as exc:
        logger.error(
            "Security triage LLM failed: %s — %d raw semgrep findings could not be summarized",
            exc,
            len(raw_results),
        )
        return _degraded_finding(
            f"Semgrep found {len(raw_results)} raw finding(s), but the AI triage step failed "
            "to summarize them — results are incomplete."
        )

    # Guarantee every finding has a valid id and normalized severity
    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])
        if f.get("severity") not in _VALID_SEVERITIES:
            f["severity"] = "medium"

    logger.info("Security agent: %d triaged findings", len(findings))
    return findings


def _degraded_finding(reason: str) -> list[dict]:
    """Honest placeholder for when the scan couldn't run or complete.

    Never a fabricated vulnerability — id/severity/file make it obvious this
    isn't a real finding, unlike a made-up "app.js has hardcoded creds" entry
    that used to appear here regardless of what the repo actually contains.
    """
    return [
        {
            "id": "scan-incomplete",
            "file": "",
            "line_start": 0,
            "line_end": 0,
            "severity": "low",
            "title": "Security scan incomplete",
            "exploit_story": reason,
            "remediation": "Re-run the analysis. If this persists, the repo may exceed the scanner's time budget.",
            "cwe": None,
        }
    ]
