"""
Integration module for Git-Mind Solidity agent.
Adds ML-based pre-screening alongside LLM analysis.
"""
import json
import sys
from pathlib import Path
from typing import Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from pure_classifier import PureSolidityClassifier, SIGNATURES


# Singleton classifier
_classifier: Optional[PureSolidityClassifier] = None


def get_classifier() -> PureSolidityClassifier:
    global _classifier
    if _classifier is None:
        _classifier = PureSolidityClassifier()
    return _classifier


def ml_prescreen(file_contents: dict[str, str]) -> list[dict]:
    """
    Quick ML pre-screening of all .sol files.
    Returns findings dict with ml_findings key.
    """
    clf = get_classifier()
    all_findings = []

    for path, code in file_contents.items():
        if not path.endswith(".sol") or not code.strip():
            continue

        result = clf.predict(code)

        if result["label"] != "safe":
            finding = {
                "id": f"ml_{result['label'][:8]}_{path.split('/')[-1][:16]}",
                "contract": path.split("/")[-1].replace(".sol", ""),
                "function": "N/A",
                "severity": result["severity"],
                "title": f"ML: {result['label'].replace('_', ' ').title()}",
                "description": result["explanation"],
                "remediation": f"Review for {result['label']} patterns",
                "swc": result.get("swc"),
                "source": "ml_classifier",
                "confidence": result.get("confidence", 0.85),
                "file": path,
            }
            all_findings.append(finding)

    return all_findings


def merge_findings(llm_findings: list[dict], ml_findings: list[dict]) -> list[dict]:
    """
    Merge LLM and ML findings.
    - Deduplicate by vulnerability type + contract
    - Add ML confidence scores
    - Prioritize critical/high
    """
    merged = list(llm_findings)

    # Index existing findings by type+contract
    existing = set()
    for f in llm_findings:
        key = (f.get("title", "").lower().split(":")[0].strip(), f.get("contract", ""))
        existing.add(key)

    # Add ML-only findings
    for ml_f in ml_findings:
        ml_type = ml_f["title"].replace("ML: ", "").lower().strip()
        contract = ml_f.get("contract", "")

        # Check if LLM already found this type
        already_found = False
        for f in merged:
            f_type = f.get("title", "").lower()
            if ml_type in f_type or f_type in ml_type:
                # Add ML confidence to existing finding
                f["ml_confidence"] = ml_f.get("confidence", 0.85)
                already_found = True
                break

        if not already_found:
            merged.append(ml_f)

    # Sort: critical first, then by confidence
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "none": 4}
    merged.sort(key=lambda x: (
        severity_order.get(x.get("severity", "medium"), 2),
        -x.get("confidence", x.get("ml_confidence", 0.5))
    ))

    return merged[:40]  # Cap at MAX_FINDINGS


def enhanced_solidity_agent(state: dict) -> dict:
    """
    Enhanced Solidity agent with ML pre-screening.
    Falls back to ML-only if sidecar unavailable.
    """
    sol_files = [f for f in state.get("file_tree", []) if f.endswith(".sol")]
    if not sol_files:
        return {"solidity_audit": None}

    contents = state.get("file_contents", {})

    # Phase 1: ML pre-screening (fast, no dependencies)
    ml_findings = ml_prescreen(contents)

    # Phase 2: LLM analysis (if sidecar available)
    try:
        import httpx
        from settings import SIDECAR_URL

        with httpx.Client(timeout=10) as client:
            resp = client.get(f"{SIDECAR_URL}/health")
            if resp.status_code != 200:
                raise Exception("Sidecar unhealthy")

        # Sidecar available — run full LLM analysis
        parsed_contracts = _parse_contracts(sol_files, contents)
        if parsed_contracts:
            llm_findings = _triage_with_llm(parsed_contracts)
        else:
            llm_findings = []

        # Merge findings
        findings = merge_findings(llm_findings, ml_findings)

    except Exception:
        # Sidecar unavailable — use ML findings only
        logger.warning("Sidecar unavailable, using ML-only analysis")
        findings = ml_findings

    return {
        "solidity_audit": {
            "contracts": _parse_contracts(sol_files, contents),
            "findings": findings,
        }
    }


def _parse_contracts(sol_files: list, contents: dict) -> list:
    """Parse contracts via sidecar."""
    import httpx
    from settings import SIDECAR_URL

    contracts = []
    with httpx.Client(timeout=30) as client:
        for path in sol_files:
            source = contents.get(path, "")
            if not source:
                continue
            try:
                resp = client.post(f"{SIDECAR_URL}/parse", json={"source": source})
                if resp.status_code == 200:
                    contracts.extend(resp.json().get("contracts", []))
            except Exception:
                continue
    return contracts


def _triage_with_llm(contracts: list) -> list:
    """LLM triage (existing logic)."""
    import uuid
    from llm_cache import get_cached, invoke_with_retry, set_cached
    from settings import LLM_MODEL, get_llm

    llm = get_llm(temperature_key="security", json_mode=True)
    cache_ns = f"{LLM_MODEL}:solidity:json"

    prompt = f"{_TRIAGE_PROMPT}\n\nContracts:\n{json.dumps(contracts, indent=2)}"
    cached = get_cached(cache_ns, prompt)

    if cached:
        findings = json.loads(cached).get("findings", [])
    else:
        try:
            raw = invoke_with_retry(llm, prompt).content
            findings = json.loads(raw).get("findings", [])
            set_cached(cache_ns, prompt, raw)
        except Exception:
            return []

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])

    return findings[:40]


_TRIAGE_PROMPT = """\
You are a senior Solidity security auditor. Analyze for:
- Re-entrancy (SWC-107)
- Integer overflow/underflow (SWC-101)
- Access control (SWC-105)
- Unsafe external calls (SWC-104)
- Front-running (SWC-114)
- Gas griefing (SWC-113)

Return JSON: {"findings": [{"id": str, "contract": str, "function": str, "severity": str, "title": str, "description": str, "remediation": str, "swc": str|null}]}
"""
