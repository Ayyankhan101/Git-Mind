import json
import os
import sys
import uuid
from pathlib import Path

import httpx
import structlog

from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import LLM_MODEL, get_llm

# ML classifier path
_ML_DIR = Path(__file__).parent.parent.parent / "ml" / "solidity_classifier"
if _ML_DIR.exists():
    sys.path.insert(0, str(_ML_DIR))

logger = structlog.get_logger(__name__)

_SIDECAR_BASE = os.getenv("SIDECAR_URL", "http://127.0.0.1:8003")
_LLM = get_llm(temperature_key="security", json_mode=True)
_CACHE_NS = f"{LLM_MODEL}:solidity:json"
_MAX_FINDINGS = 40

# ML classifier (lazy load)
_ml_clf = None


def _get_ml_classifier():
    global _ml_clf
    if _ml_clf is not None:
        return _ml_clf
    try:
        from pure_classifier import PureSolidityClassifier
        _ml_clf = PureSolidityClassifier()
        logger.info("ML classifier loaded")
        return _ml_clf
    except ImportError as e:
        logger.warning("ML classifier unavailable: %s", e)
        return None


def _ml_prescreen(file_contents: dict) -> list[dict]:
    """Fast ML pre-screening of .sol files."""
    clf = _get_ml_classifier()
    if clf is None:
        return []

    findings = []
    for path, code in file_contents.items():
        if not path.endswith(".sol") or not code.strip():
            continue

        result = clf.predict(code)
        if result["label"] != "safe":
            findings.append({
                "id": f"ml_{result['label'][:8]}_{uuid.uuid4().hex[:6]}",
                "contract": path.split("/")[-1].replace(".sol", ""),
                "function": "N/A",
                "severity": result["severity"],
                "title": f"ML: {result['label'].replace('_', ' ').title()}",
                "description": result["explanation"],
                "remediation": f"Review for {result['label']} patterns",
                "swc": result.get("swc"),
                "source": "ml_classifier",
                "confidence": result.get("confidence", 0.85),
            })

    return findings


def _merge_findings(llm_findings: list, ml_findings: list) -> list:
    """Merge LLM + ML findings, deduplicate."""
    merged = list(llm_findings)

    for ml_f in ml_findings:
        ml_type = ml_f["title"].replace("ML: ", "").lower()
        already = any(ml_type in f.get("title", "").lower() for f in merged)
        if not already:
            merged.append(ml_f)

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "none": 4}
    merged.sort(key=lambda x: severity_order.get(x.get("severity", "medium"), 2))
    return merged[:_MAX_FINDINGS]


def solidity_agent(state: dict) -> dict:
    sol_files = [f for f in state.get("file_tree", []) if f.endswith(".sol")]
    if not sol_files:
        return {"solidity_audit": None}

    contents = state.get("file_contents", {})

    # Phase 1: ML pre-screening
    ml_findings = _ml_prescreen(contents)

    # Phase 2: LLM + sidecar
    parsed_contracts = []
    sidecar_ok = False

    try:
        with httpx.Client(timeout=10) as client:
            for path in sol_files:
                source = contents.get(path, "")
                if not source:
                    continue
                try:
                    resp = client.post(f"{_SIDECAR_BASE}/parse", json={"source": source})
                    if resp.status_code == 200:
                        parsed_contracts.extend(resp.json().get("contracts", []))
                        sidecar_ok = True
                    else:
                        logger.warning("sidecar %s returned %d", path, resp.status_code)
                except httpx.RequestError as exc:
                    logger.warning("sidecar error: %s", exc)
    except Exception as exc:
        logger.warning("sidecar unreachable: %s", exc)

    # LLM triage if sidecar worked
    llm_findings = []
    if sidecar_ok and parsed_contracts:
        llm_findings = _triage_with_llm(parsed_contracts)

    # Merge findings
    findings = _merge_findings(llm_findings, ml_findings)

    if not findings and not parsed_contracts:
        return {"solidity_audit": None}

    return {
        "solidity_audit": {
            "contracts": parsed_contracts,
            "findings": findings,
        }
    }


def _triage_with_llm(contracts: list) -> list:
    prompt = f"{_TRIAGE_PROMPT}\n\nContracts:\n{json.dumps(contracts, indent=2)}"
    cached = get_cached(_CACHE_NS, prompt)

    if cached:
        logger.debug("Solidity agent: cache hit")
        findings = json.loads(cached).get("findings", [])
    else:
        try:
            raw = invoke_with_retry(_LLM, prompt).content
            findings = json.loads(raw).get("findings", [])
            set_cached(_CACHE_NS, prompt, raw)
        except (json.JSONDecodeError, Exception) as exc:
            logger.error("Solidity triage LLM failed: %s", exc)
            return []

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])

    return findings[:_MAX_FINDINGS]


_TRIAGE_PROMPT = """\
You are a senior Solidity security auditor. Below is a structured AST dump
of a Solidity project: contracts, functions, state variables, modifiers, events.

Analyze each contract for:
- Re-entrancy vulnerabilities
- Unchecked external calls
- Integer overflow / underflow
- Access control issues (tx.origin, missing onlyOwner)
- Uninitialized storage pointers
- Front-running / race conditions
- Gas griefing
- Logic errors in function visibility

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "contract"     — contract name
  "function"     — function name (or "constructor" / "fallback")
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the bug
  "remediation"  — one concrete fix sentence
  "swc"          — SWC identifier if applicable (e.g. "SWC-107"), or null

If no issues found, return {"findings": []}.
"""
