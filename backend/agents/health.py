from gitmind_core import compute_docs_score


def compute_health(
    file_contents: dict,
    security_findings: list,
    cve_findings: list,
    api_docs: list,
    code_audit: list | None = None,
) -> dict:
    sec = _security_score(security_findings)
    docs = _docs_score(file_contents)
    api = _api_score(api_docs)
    dep = _dep_score(cve_findings)
    code = _code_quality_score(code_audit)

    total = round(sec * 0.35 + docs * 0.15 + api * 0.15 + dep * 0.15 + code * 0.20)
    grade = "A" if total >= 90 else "B" if total >= 80 else "C" if total >= 70 else "D" if total >= 60 else "F"

    return {
        "score": total,
        "grade": grade,
        "breakdown": {
            "security": round(sec),
            "documentation": round(docs),
            "api_coverage": round(api),
            "dependency_freshness": round(dep),
            "code_quality": round(code),
        },
    }


def _flatten_code_audit_findings(code_audit: list | None) -> list[dict]:
    if not code_audit:
        return []
    findings: list[dict] = []
    for lang_result in code_audit:
        if not isinstance(lang_result, dict):
            continue
        findings.extend(lang_result.get("findings") or [])
    return findings


def _security_score(findings: list) -> float:
    penalties = {"critical": 25, "high": 10, "medium": 3, "low": 1}
    total_penalty = sum(penalties.get(f.get("severity", "low"), 1) for f in findings)
    return max(0.0, 100.0 - total_penalty)


def _code_quality_score(code_audit: list | None) -> float:
    findings = _flatten_code_audit_findings(code_audit)
    if not findings:
        return 100.0
    penalties = {"critical": 20, "high": 8, "medium": 3, "low": 1}
    total_penalty = sum(penalties.get(f.get("severity", "low"), 1) for f in findings)
    return max(0.0, 100.0 - total_penalty)


def _docs_score(file_contents: dict) -> float:
    return compute_docs_score(file_contents)


def _api_score(api_docs: list) -> float:
    if not api_docs:
        return 50.0
    with_desc = sum(1 for e in api_docs if (e.get("description") or "").strip())
    return round(with_desc / len(api_docs) * 100, 1)


def _dep_score(cve_findings: list) -> float:
    if not cve_findings:
        return 100.0
    penalties = {"critical": 15, "high": 8, "medium": 3, "low": 1}
    total = sum(penalties.get(pkg.get("worst_severity", "low"), 1) for pkg in cve_findings)
    return max(0.0, 100.0 - total)
