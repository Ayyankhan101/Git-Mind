import re

_COMMENT_RE = re.compile(r'^\s*(#|//|/\*|\*|""")', re.MULTILINE)


def compute_health(
    file_contents: dict,
    security_findings: list,
    cve_findings: list,
    api_docs: list,
) -> dict:
    sec  = _security_score(security_findings)
    docs = _docs_score(file_contents)
    api  = _api_score(api_docs)
    dep  = _dep_score(cve_findings)

    total = round(sec * 0.40 + docs * 0.20 + api * 0.20 + dep * 0.20)
    grade = "A" if total >= 90 else "B" if total >= 80 else "C" if total >= 70 else "D" if total >= 60 else "F"

    return {
        "score": total,
        "grade": grade,
        "breakdown": {
            "security":             round(sec),
            "documentation":        round(docs),
            "api_coverage":         round(api),
            "dependency_freshness": round(dep),
        },
    }


def _security_score(findings: list) -> float:
    penalties = {"critical": 25, "high": 10, "medium": 3, "low": 1}
    total_penalty = sum(penalties.get(f.get("severity", "low"), 1) for f in findings)
    return max(0.0, 100.0 - total_penalty)


def _docs_score(file_contents: dict) -> float:
    if not file_contents:
        return 50.0
    code_exts = {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php"}
    total_lines = comment_lines = 0
    for path, content in file_contents.items():
        if not any(path.endswith(ext) for ext in code_exts):
            continue
        lines = content.splitlines()
        total_lines += len(lines)
        comment_lines += sum(1 for ln in lines if _COMMENT_RE.match(ln))
    if total_lines == 0:
        return 50.0
    ratio = comment_lines / total_lines
    return min(100.0, ratio * 1000)


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
