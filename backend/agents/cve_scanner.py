import json
import logging
import re

import httpx

logger = logging.getLogger(__name__)

_OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
_SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


# ── Dependency file parsers ────────────────────────────────────────────────────

def _parse_requirements_txt(content: str) -> list[dict]:
    deps = []
    for line in content.splitlines():
        line = line.strip().split("#")[0].strip()
        # Match pinned (==) and ranged (>=, ~=, <=) — use first version as proxy
        m = re.match(r'^([A-Za-z0-9_\-\.]+)\s*(?:==|>=|~=|<=)\s*([0-9][^\s;,]*)', line)
        if m:
            ver = m.group(2).split(',')[0].strip()
            deps.append({"name": m.group(1), "version": ver, "ecosystem": "PyPI"})
    return deps


def _parse_package_lock(content: str) -> list[dict]:
    try:
        data = json.loads(content)
    except Exception:
        return []
    deps = []
    for pkg, info in data.get("packages", {}).items():
        if not pkg:
            continue
        name = re.sub(r'^node_modules/', '', pkg)
        version = info.get("version", "")
        if version:
            deps.append({"name": name, "version": version, "ecosystem": "npm"})
    return deps[:120]


def _parse_package_json(content: str) -> list[dict]:
    try:
        data = json.loads(content)
    except Exception:
        return []
    deps = []
    for section in ("dependencies", "devDependencies"):
        for name, ver in data.get(section, {}).items():
            v = re.sub(r'^[^\d]*', '', ver)
            if v and re.match(r'^\d', v):
                deps.append({"name": name, "version": v, "ecosystem": "npm"})
    return deps


def _parse_cargo_lock(content: str) -> list[dict]:
    deps, name, version = [], None, None
    for line in content.splitlines():
        if line.startswith("name = "):
            m = re.search(r'"([^"]+)"', line)
            name = m.group(1) if m else None
        elif line.startswith("version = "):
            m = re.search(r'"([^"]+)"', line)
            version = m.group(1) if m else None
            if name and version:
                deps.append({"name": name, "version": version, "ecosystem": "crates.io"})
            name = version = None
    return deps


def _parse_go_sum(content: str) -> list[dict]:
    deps, seen = [], set()
    for line in content.splitlines():
        parts = line.split()
        if len(parts) >= 2 and "/" in parts[1]:
            mod = parts[0]
            ver = parts[1].split("/")[0].lstrip("v")
            if mod not in seen and re.match(r'^\d', ver):
                seen.add(mod)
                deps.append({"name": mod, "version": ver, "ecosystem": "Go"})
    return deps[:100]


def _parse_yarn_lock(content: str) -> list[dict]:
    """Parse yarn.lock — split into package blocks, extract name + version."""
    deps, seen = [], set()
    for block in re.split(r'\n(?=\S)', content):
        block = block.strip()
        if not block or block.startswith('#'):
            continue
        m_name = re.match(r'^"?(@?[^@"\s,]+)@', block)
        m_ver  = re.search(r'^\s+version "([^"]+)"', block, re.MULTILINE)
        if not m_name or not m_ver:
            continue
        name, version = m_name.group(1), m_ver.group(1)
        key = (name.lower(), version)
        if key not in seen and re.match(r'^\d', version):
            seen.add(key)
            deps.append({"name": name, "version": version, "ecosystem": "npm"})
    return deps[:150]


def _parse_pnpm_lock(content: str) -> list[dict]:
    """Parse pnpm-lock.yaml — matches /name@version: and name@version: entries."""
    deps, seen = [], set()
    for m in re.finditer(r'^\s+/?(@?[^@\s/]+)@(\d[^/:"\s]+)', content, re.MULTILINE):
        name, version = m.group(1), m.group(2).strip()
        key = (name.lower(), version)
        if key not in seen:
            seen.add(key)
            deps.append({"name": name, "version": version, "ecosystem": "npm"})
    return deps[:150]


def _parse_poetry_lock(content: str) -> list[dict]:
    """Parse poetry.lock TOML — extract [[package]] blocks."""
    deps: list[dict] = []
    name = version = None
    for line in content.splitlines():
        stripped = line.strip()
        if stripped == "[[package]]":
            name = version = None
        elif stripped.startswith("name = "):
            m = re.search(r'"([^"]+)"', stripped)
            name = m.group(1) if m else None
        elif stripped.startswith("version = "):
            m = re.search(r'"([^"]+)"', stripped)
            version = m.group(1) if m else None
            if name and version and re.match(r'^\d', version):
                deps.append({"name": name, "version": version, "ecosystem": "PyPI"})
                name = version = None
    return deps


def _parse_pipfile_lock(content: str) -> list[dict]:
    """Parse Pipfile.lock JSON."""
    try:
        data = json.loads(content)
    except Exception:
        return []
    deps = []
    for section in ("default", "develop"):
        for name, info in data.get(section, {}).items():
            ver = re.sub(r'^[=<>!^~*\s]+', '', info.get("version", ""))
            if ver and re.match(r'^\d', ver):
                deps.append({"name": name, "version": ver, "ecosystem": "PyPI"})
    return deps


def _parse_gemfile_lock(content: str) -> list[dict]:
    """Parse Gemfile.lock — extract gems from the specs: block."""
    deps, seen, in_specs = [], set(), False
    for line in content.splitlines():
        if line.strip() == "specs:":
            in_specs = True
            continue
        if in_specs and line and not line[0].isspace():
            in_specs = False
        if in_specs:
            m = re.match(r'^\s{4}([a-zA-Z0-9_\-]+)\s+\(([^\)]+)\)', line)
            if m:
                name, version = m.group(1), m.group(2)
                key = (name.lower(), version)
                if key not in seen and re.match(r'^\d', version):
                    seen.add(key)
                    deps.append({"name": name, "version": version, "ecosystem": "RubyGems"})
    return deps[:100]


def _collect_deps(file_contents: dict[str, str]) -> list[dict]:
    has_npm_lock = any(
        fp.split("/")[-1] in ("package-lock.json", "yarn.lock", "pnpm-lock.yaml")
        for fp in file_contents
    )
    has_py_lock = any(
        fp.split("/")[-1] in ("poetry.lock", "Pipfile.lock")
        for fp in file_contents
    )
    deps = []
    for filepath, content in file_contents.items():
        fname = filepath.split("/")[-1]
        if fname == "requirements.txt" and not has_py_lock:
            deps.extend(_parse_requirements_txt(content))
        elif fname == "poetry.lock":
            deps.extend(_parse_poetry_lock(content))
        elif fname == "Pipfile.lock":
            deps.extend(_parse_pipfile_lock(content))
        elif fname == "package-lock.json":
            deps.extend(_parse_package_lock(content))
        elif fname == "yarn.lock":
            deps.extend(_parse_yarn_lock(content))
        elif fname == "pnpm-lock.yaml":
            deps.extend(_parse_pnpm_lock(content))
        elif fname == "package.json" and not has_npm_lock:
            deps.extend(_parse_package_json(content))
        elif fname == "Cargo.lock":
            deps.extend(_parse_cargo_lock(content))
        elif fname == "go.sum":
            deps.extend(_parse_go_sum(content))
        elif fname == "Gemfile.lock":
            deps.extend(_parse_gemfile_lock(content))
    # Deduplicate
    seen: set[tuple] = set()
    unique = []
    for d in deps:
        key = (d["name"].lower(), d["version"], d["ecosystem"])
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique[:80]


# ── OSV.dev query ──────────────────────────────────────────────────────────────

def _cvss_to_severity(score_str: str) -> str:
    try:
        s = float(score_str)
        if s >= 9.0: return "critical"
        if s >= 7.0: return "high"
        if s >= 4.0: return "medium"
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
    deps = _collect_deps(file_contents)
    if not deps:
        logger.info("CVE scanner: no lockfiles found")
        return []

    queries = [
        {"version": d["version"], "package": {"name": d["name"], "ecosystem": d["ecosystem"]}}
        for d in deps
    ]

    try:
        resp = httpx.post(_OSV_BATCH_URL, json={"queries": queries}, timeout=20.0)
        resp.raise_for_status()
        batch = resp.json().get("results", [])
    except Exception as exc:
        logger.warning("CVE scanner: OSV.dev unreachable — %s", exc)
        return []

    results = []
    for dep, result in zip(deps, batch):
        vulns_raw = result.get("vulns", [])
        if not vulns_raw:
            continue
        vulns = sorted(
            [
                {
                    "id":       v.get("id", ""),
                    "summary":  v.get("summary", ""),
                    "severity": _parse_severity(v),
                    "fixed_in": _get_fix_version(v),
                    "url":      f"https://osv.dev/vulnerability/{v.get('id', '')}",
                }
                for v in vulns_raw
            ],
            key=lambda v: _SEV_ORDER.get(v["severity"], 4),
        )
        results.append({
            "package":        dep["name"],
            "version":        dep["version"],
            "ecosystem":      dep["ecosystem"],
            "vulns":          vulns,
            "worst_severity": vulns[0]["severity"],
            "vuln_count":     len(vulns),
        })

    results.sort(key=lambda r: _SEV_ORDER.get(r["worst_severity"], 4))
    logger.info("CVE scanner: %d vulnerable packages found (scanned %d)", len(results), len(deps))
    return results
