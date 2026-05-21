def compute_impact(base: dict, pr: dict) -> dict:
    """Diff two analysis snapshots. Returns delta metrics."""

    def _health(d):
        return d.get("health") or {}

    base_h = _health(base)
    pr_h   = _health(pr)

    base_score = base_h.get("score", 0)
    pr_score   = pr_h.get("score", 0)

    def _finding_key(f):
        return f"{f.get('rule','')}|{f.get('file','')}|{f.get('line','')}"

    base_sec = {_finding_key(f): f for f in (base.get("security_findings") or [])}
    pr_sec   = {_finding_key(f): f for f in (pr.get("security_findings")   or [])}

    new_findings   = [f for k, f in pr_sec.items()   if k not in base_sec]
    fixed_findings = [f for k, f in base_sec.items() if k not in pr_sec]

    def _cve_key(c):
        return f"{c.get('package','')}@{c.get('version','')}"

    base_cve = {_cve_key(c): c for c in (base.get("cve_findings") or [])}
    pr_cve   = {_cve_key(c): c for c in (pr.get("cve_findings")   or [])}

    new_cves   = [c for k, c in pr_cve.items()   if k not in base_cve]
    fixed_cves = [c for k, c in base_cve.items() if k not in pr_cve]

    base_bd = base_h.get("breakdown") or {}
    pr_bd   = pr_h.get("breakdown")   or {}
    keys    = ("security", "documentation", "api_coverage", "dependency_freshness")

    return {
        "base_score":      base_score,
        "pr_score":        pr_score,
        "health_delta":    pr_score - base_score,
        "base_grade":      base_h.get("grade", "?"),
        "pr_grade":        pr_h.get("grade", "?"),
        "new_findings":    new_findings,
        "fixed_findings":  fixed_findings,
        "new_cves":        new_cves,
        "fixed_cves":      fixed_cves,
        "findings_delta":  len(new_findings) - len(fixed_findings),
        "breakdown_delta": {k: pr_bd.get(k, 0) - base_bd.get(k, 0) for k in keys},
    }
