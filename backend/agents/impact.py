import json
import structlog

from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import LLM_MODEL, get_llm

logger = structlog.get_logger(__name__)

_CACHE_NAMESPACE = f"{LLM_MODEL}:merge_prediction"
_MAX_DIFF_CHARS = 10_000
_LLM = get_llm(temperature_key="impact")


def compute_impact(base: dict, pr: dict) -> dict:
    """Diff two analysis snapshots. Returns delta metrics."""

    def _health(d):
        return d.get("health") or {}

    base_h = _health(base)
    pr_h = _health(pr)

    base_score = base_h.get("score", 0)
    pr_score = pr_h.get("score", 0)

    def _finding_key(f):
        return f"{f.get('rule', '')}|{f.get('file', '')}|{f.get('line', '')}"

    base_sec = {_finding_key(f): f for f in (base.get("security_findings") or [])}
    pr_sec = {_finding_key(f): f for f in (pr.get("security_findings") or [])}

    new_findings = [f for k, f in pr_sec.items() if k not in base_sec]
    fixed_findings = [f for k, f in base_sec.items() if k not in pr_sec]

    def _cve_key(c):
        return f"{c.get('package', '')}@{c.get('version', '')}"

    base_cve = {_cve_key(c): c for c in (base.get("cve_findings") or [])}
    pr_cve = {_cve_key(c): c for c in (pr.get("cve_findings") or [])}

    new_cves = [c for k, c in pr_cve.items() if k not in base_cve]
    fixed_cves = [c for k, c in base_cve.items() if k not in pr_cve]

    base_bd = base_h.get("breakdown") or {}
    pr_bd = pr_h.get("breakdown") or {}
    keys = ("security", "documentation", "api_coverage", "dependency_freshness", "code_quality")

    return {
        "base_score": base_score,
        "pr_score": pr_score,
        "health_delta": pr_score - base_score,
        "base_grade": base_h.get("grade", "?"),
        "pr_grade": pr_h.get("grade", "?"),
        "new_findings": new_findings,
        "fixed_findings": fixed_findings,
        "new_cves": new_cves,
        "fixed_cves": fixed_cves,
        "findings_delta": len(new_findings) - len(fixed_findings),
        "breakdown_delta": {k: pr_bd.get(k, 0) - base_bd.get(k, 0) for k in keys},
    }


def run_merge_prediction(
    diff: str,
    delta: dict,
    pr_meta: dict,
) -> dict:
    """
    LLM-generated plain-English merge impact prediction.

    pr_meta keys: title, owner, repo, pr_num, base_branch,
                  additions, deletions, changed_files, diff_truncated
    """
    head_sha = pr_meta.get("head_sha", "")
    cache_key = f"{pr_meta.get('owner')}/{pr_meta.get('repo')}#{pr_meta.get('pr_num')}:{head_sha}:predict"
    cached = get_cached(_CACHE_NAMESPACE, cache_key)
    if cached:
        logger.debug("merge_prediction: cache hit %s", cache_key)
        try:
            return json.loads(cached)
        except Exception as exc:
            logger.debug("merge_prediction: cache decode failed: %s", exc)

    truncated_diff = diff[:_MAX_DIFF_CHARS]
    diff_note = "⚠ Diff truncated to first 10 000 chars.\n" if len(diff) > _MAX_DIFF_CHARS else ""

    new_f = delta.get("new_findings", [])
    fix_f = delta.get("fixed_findings", [])
    new_c = delta.get("new_cves", [])
    fix_c = delta.get("fixed_cves", [])
    h_delta = delta.get("health_delta", 0)

    metrics_summary = (
        f"Health score: {delta.get('base_score', '?')} ({delta.get('base_grade', '?')}) "
        f"→ {delta.get('pr_score', '?')} ({delta.get('pr_grade', '?')})  "
        f"[delta {h_delta:+d}]\n"
        f"Security findings: +{len(new_f)} new, {len(fix_f)} fixed\n"
        f"CVE vulnerabilities: +{len(new_c)} new, {len(fix_c)} resolved\n"
        f"Score breakdown deltas: {delta.get('breakdown_delta', {})}\n"
    )

    prompt = (
        f"You are a senior tech lead evaluating whether to merge a pull request "
        f"into {pr_meta.get('base_branch', 'main')}.\n\n"
        f"PR: {pr_meta.get('owner')}/{pr_meta.get('repo')} #{pr_meta.get('pr_num')} — "
        f'"{pr_meta.get("title", "")}"\n'
        f"Stats: +{pr_meta.get('additions', 0)} / -{pr_meta.get('deletions', 0)} across "
        f"{pr_meta.get('changed_files', 0)} file(s)\n"
        f"{diff_note}\n"
        "=== COMPUTED METRICS ===\n"
        f"{metrics_summary}\n"
        "=== DIFF ===\n"
        f"{truncated_diff}\n\n"
        "Based on the diff and metrics above, produce a merge impact prediction "
        "as valid JSON (no markdown, no explanation outside the JSON):\n\n"
        "{{\n"
        '  "merge_risk": "<low|medium|high|critical>",\n'
        '  "recommendation": "<Safe to merge|Merge with caution|Block — requires changes>",\n'
        '  "one_liner": "<One sentence describing the net effect if this PR is merged>",\n'
        '  "affected_areas": ["<area1>", "<area2>"],\n'
        '  "breaking_changes": ["<change1>"],\n'
        '  "narrative": "<2-3 paragraph plain-English explanation of what happens '
        "to the software if this PR is approved and merged. Cover: what changes, "
        'what improves, what regresses, and any risks the team should know.>",\n'
        '  "confidence": "<high|medium|low>"\n'
        "}}\n\n"
        "Rules:\n"
        "- merge_risk reflects the COMBINED risk: code quality + security delta "
        "+ breaking changes.\n"
        "- breaking_changes: only include ACTUAL breaking changes "
        "(renamed endpoints, removed exports, changed function signatures, "
        "DB migrations). Empty array if none.\n"
        '- affected_areas: max 5 short labels (e.g. "Auth", "API routes", '
        '"Database", "Frontend", "CI/CD").\n'
        "- narrative: plain English, no bullet points, no markdown inside "
        "the string. Be specific — reference actual file names or functions "
        "from the diff.\n"
        '- confidence: "low" if diff was truncated or PR is very large. '
        '"high" if full diff was available and analysis is clear.\n'
        "- Output ONLY the JSON object. No preamble."
    )

    raw = invoke_with_retry(_LLM, prompt).content.strip()

    # Strip markdown code fences if model wrapped it
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
    except Exception:
        # Graceful fallback — still useful partial data
        logger.warning("merge_prediction: JSON parse failed, returning raw")
        result = {
            "merge_risk": "medium",
            "recommendation": "Merge with caution",
            "one_liner": "Impact prediction available — see narrative below.",
            "affected_areas": [],
            "breaking_changes": [],
            "narrative": raw,
            "confidence": "low",
        }

    set_cached(_CACHE_NAMESPACE, cache_key, json.dumps(result))
    logger.info(
        "merge_prediction done: risk=%s rec=%s",
        result.get("merge_risk"),
        result.get("recommendation"),
    )
    return result
