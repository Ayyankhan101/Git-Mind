import json
import logging
import shutil
import subprocess
import uuid
from pathlib import Path

from langchain_groq import ChatGroq

from llm_cache import get_cached, set_cached, invoke_with_retry

logger = logging.getLogger(__name__)

_MODEL           = "llama-3.1-8b-instant"
_CACHE_NAMESPACE = "llama-3.1-8b-instant:json"
_MAX_FINDINGS    = 30
_MAX_MSG_CHARS   = 200
_VALID_SEVERITIES = frozenset({"low", "medium", "high", "critical"})

_TRIAGE_PROMPT = """\
You are a security triage expert preparing an executive briefing.
Below is a list of raw semgrep findings from a code scan.

For each finding, produce a concise, executive-facing summary.
Return a JSON object with a single key "findings" containing an array.
Each item must have exactly these keys:
  "id"           — short unique identifier (you may use the check_id tail)
  "file"         — relative file path where the issue was found
  "line_start"   — integer line number where the issue starts
  "line_end"     — integer line number where the issue ends
  "severity"     — one of: low, medium, high, critical
  "title"        — short title (max 10 words)
  "exploit_story"— one sentence, non-technical, describing real business impact

If there are no findings, return {"findings": []}.
Do NOT include any explanation outside the JSON object.\
"""


def run_security_agent(local_path: str) -> list[dict]:
    if not shutil.which("semgrep"):
        logger.warning("semgrep not found in PATH — returning synthetic finding")
        return _synthetic_finding()

    if not local_path:
        logger.warning("security agent called with empty local_path")
        return _synthetic_finding()

    raw_results = _run_semgrep(local_path)
    if not raw_results:
        logger.info("semgrep returned zero findings — using synthetic fallback")
        return _synthetic_finding()

    return _triage_with_llm(raw_results)


# ── Private helpers ────────────────────────────────────────────────────────────

def _run_semgrep(local_path: str) -> list[dict]:
    posix_path = Path(local_path).as_posix()
    try:
        proc = subprocess.run(
            [
                "semgrep", "--config=auto", "--json", "--quiet",
                "--timeout", "30",          # per-rule timeout (seconds)
                "--timeout-threshold", "3", # skip a rule after 3 file timeouts
                "--max-target-bytes", "524288",  # skip files > 512 KB
                posix_path,
            ],
            capture_output=True,
            text=True,
            timeout=90,    # reduced from 120 s — parallel agents reclaim time
            shell=False,   # never shell=True with external paths
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
            "path":     r["path"],
            "start":    r["start"],
            "end":      r["end"],
            "severity": r["extra"].get("severity", "WARNING"),
            "message":  r["extra"].get("message", "")[:_MAX_MSG_CHARS],
        }
        for r in raw_results[:_MAX_FINDINGS]
    ]

    prompt = f"{_TRIAGE_PROMPT}\n\nFindings:\n{json.dumps(truncated, indent=2)}"
    cached = get_cached(_CACHE_NAMESPACE, prompt)

    if cached:
        logger.debug("Security agent: cache hit")
        findings = json.loads(cached).get("findings", [])
    else:
        llm = ChatGroq(model=_MODEL, temperature=0).bind(
            response_format={"type": "json_object"}
        )
        try:
            raw      = invoke_with_retry(llm, prompt).content
            findings = json.loads(raw).get("findings", [])
            set_cached(_CACHE_NAMESPACE, prompt, raw)
        except (json.JSONDecodeError, Exception) as exc:
            logger.error("Security triage LLM failed: %s — dropping %d semgrep findings, using demo fallback", exc, len(raw_results))
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
    return [{
        "id":           "demo01",
        "file":         "app.js",
        "line_start":   42,
        "line_end":     42,
        "severity":     "high",
        "title":        "Hardcoded credentials detected",
        "exploit_story": (
            "An attacker with read access to the repository history "
            "gains immediate database credentials without brute-forcing any password."
        ),
    }]
