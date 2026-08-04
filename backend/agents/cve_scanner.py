import structlog

import httpx
from gitmind_core import parse_dependencies

logger = structlog.get_logger(__name__)

_OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
_SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


# ── OSV.dev query ──────────────────────────────────────────────────────────────


def _cvss_to_severity(score_str: str) -> str:
    try:
        s = float(score_str)
        if s >= 9.0:
            return "critical"
        if s >= 7.0:
            return "high"
        if s >= 4.0:
            return "medium"
        return "low"
    except Exception:
        return "medium"


def _parse_severity(vuln: dict) -> str:
    for sev in vuln.get("severity", []):
        score = sev.get("score", "")
        if score:
            return _cvss_to_severity(score)
    db_sev = vuln.get("database_specific", {}).get("severity", "")
    if isinstance(db_sev, str) and db_sev:
        return db_sev.lower()
    return "medium"


def _get_fix_version(vuln: dict) -> str | None:
    for affected in vuln.get("affected", []):
        for r in affected.get("ranges", []):
            for ev in r.get("events", []):
                if "fixed" in ev:
                    return ev["fixed"]
    return None


def run_cve_scanner(file_contents: dict[str, str]) -> list[dict]:
    """Scan dependency files against OSV.dev vulnerability database."""
    deps = parse_dependencies(file_contents)
    if not deps:
        logger.info("CVE scanner: no lockfiles found")
        return []

    queries = [{"version": d["version"], "package": {"name": d["name"], "ecosystem": d["ecosystem"]}} for d in deps]

    try:
        resp = httpx.post(_OSV_BATCH_URL, json={"queries": queries}, timeout=20.0)
        resp.raise_for_status()
        batch = resp.json().get("results", [])
    except Exception as exc:
        logger.warning("CVE scanner: OSV.dev unreachable — %s", exc)
        return []

    if len(deps) != len(batch):
        logger.warning(
            "OSV response length mismatch: %d deps vs %d results — results may be truncated", len(deps), len(batch)
        )
    results = []
    for dep, result in zip(deps, batch, strict=False):
        vulns_raw = result.get("vulns", [])
        if not vulns_raw:
            continue
        vulns = sorted(
            [
                {
                    "id": v.get("id", ""),
                    "summary": v.get("summary", ""),
                    "severity": _parse_severity(v),
                    "fixed_in": _get_fix_version(v),
                    "url": f"https://osv.dev/vulnerability/{v.get('id', '')}",
                }
                for v in vulns_raw
            ],
            key=lambda v: _SEV_ORDER.get(v["severity"], 4),
        )
        results.append(
            {
                "package": dep["name"],
                "version": dep["version"],
                "ecosystem": dep["ecosystem"],
                "vulns": vulns,
                "worst_severity": vulns[0]["severity"],
                "vuln_count": len(vulns),
            }
        )

    results.sort(key=lambda r: _SEV_ORDER.get(r["worst_severity"], 4))
    logger.info("CVE scanner: %d vulnerable packages found (scanned %d)", len(results), len(deps))
    return results
