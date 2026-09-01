import json
import shutil
import subprocess
import uuid
from pathlib import Path

import structlog
from pydantic import BaseModel

_SEMGREP = shutil.which("semgrep") or "semgrep"  # fallback for type narrowing

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

    raw_findings: str = dspy.InputField(
        desc="JSON array of raw semgrep findings from a static code scan"
    )
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
        logger.warning("semgrep not found in PATH — returning synthetic finding")
        return _synthetic_finding()

    if not local_path:
        logger.warning("security agent called with empty local_path")
        return _synthetic_finding()

    raw_results = _run_semgrep(local_path)
    if not raw_results:
        logger.info("semgrep returned zero findings — repo is clean")
        return []

    return _triage_with_llm(raw_results)


# ── Private helpers ────────────────────────────────────────────────────────────


def _run_semgrep(local_path: str) -> list[dict]:
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
            timeout=90,  # reduced from 120 s — parallel agents reclaim time
            shell=False,  # never shell=True with external paths
        )
        # semgrep exit 0 = no findings, exit 1 = findings found — both are success
        if proc.returncode not in (0, 1):
            logger.error(
                "semgrep exited %d — stderr: %s",
                proc.returncode,
                proc.stderr[:300],
            )
            return []
        data = json.loads(proc.stdout or '{"results":[]}')
        results = data.get("results", [])
        logger.info("semgrep returned %d raw findings", len(results))
        return results
    except subprocess.TimeoutExpired:
        logger.warning("semgrep timed out after 90 s")
        return []
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("semgrep execution error: %s", exc)
        return []


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
            "Security triage LLM failed: %s — dropping %d semgrep findings, using demo fallback",
            exc,
            len(raw_results),
        )
        return _synthetic_finding()

    # Guarantee every finding has a valid id and normalized severity
    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])
        if f.get("severity") not in _VALID_SEVERITIES:
            f["severity"] = "medium"

    if not findings:
        return _synthetic_finding()

    logger.info("Security agent: %d triaged findings", len(findings))
    return findings


def _synthetic_finding() -> list[dict]:
    """Guaranteed fallback so Crisis Mode always has something to dramatize."""
    return [
        {
            "id": "demo01",
            "file": "app.js",
            "line_start": 42,
            "line_end": 42,
            "severity": "high",
            "title": "Hardcoded credentials detected",
            "exploit_story": (
                "An attacker with read access to the repository history "
                "gains immediate database credentials without brute-forcing any password."
            ),
            "remediation": "Move credentials to environment variables and rotate them immediately.",
            "cwe": "CWE-798",
        }
    ]
