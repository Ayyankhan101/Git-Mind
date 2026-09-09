import json
import os
import sys
import uuid
from pathlib import Path

import httpx
import structlog
from pydantic import BaseModel

from core.dspy_setup import dspy
from core.llm_cache import run_dspy_cached
from core.settings import LLM_MODEL, get_dspy_lm
from optimization.registry import define_program

# ML classifier path
_ML_DIR = Path(__file__).parent.parent.parent / "ml" / "solidity_classifier"
if _ML_DIR.exists():
    sys.path.insert(0, str(_ML_DIR))

logger = structlog.get_logger(__name__)

_SIDECAR_BASE = os.getenv("SIDECAR_URL", "http://127.0.0.1:8003")
_LM = get_dspy_lm(temperature_key="security")
_CACHE_NS = f"{LLM_MODEL}:solidity:json"
_MAX_FINDINGS = 40


class SolidityFinding(BaseModel):
    """Solidity audit finding — shape matches the frontend contract exactly."""

    id: str
    contract: str
    function: str
    severity: str
    title: str
    description: str
    remediation: str
    swc: str | None = None


class SolidityTriage(dspy.Signature):
    """You are a senior Solidity security auditor.

    Analyze the contracts below for: re-entrancy vulnerabilities, unchecked external calls,
    integer overflow / underflow, access control issues (tx.origin, missing onlyOwner),
    uninitialized storage pointers, front-running / race conditions, gas griefing, and
    logic errors in function visibility. If no issues are found, return an empty list.
    """

    contracts_json: str = dspy.InputField(
        desc="Structured AST dump: contracts, functions, state variables, modifiers, events"
    )
    findings: list[SolidityFinding] = dspy.OutputField(
        desc=(
            "Audit findings. Each has: id (short unique id), contract (name), function "
            "(name or 'constructor' / 'fallback'), severity (critical|high|medium|low), "
            "title (max 10 words), description (one sentence explaining the bug), "
            "remediation (one concrete fix sentence), swc (SWC identifier e.g. 'SWC-107' or null)."
        )
    )


_predictor = define_program(
    "solidity",
    SolidityTriage,
    output_field="findings",
    input_fields=("contracts_json",),
    output_model=SolidityFinding,
)

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
            findings.append(
                {
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
                }
            )

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
        if not sidecar_ok and _get_ml_classifier() is None:
            # sol_files is non-empty here — there IS Solidity in this repo,
            # but neither the sidecar nor the ML classifier ever ran, so
            # nothing was actually audited. Returning None here would read
            # as "no Solidity in this repository", which is false.
            raise RuntimeError("Solidity audit tooling unavailable (sidecar unreachable, ML classifier not loaded)")
        return {"solidity_audit": None}

    return {
        "solidity_audit": {
            "contracts": parsed_contracts,
            "findings": findings,
        }
    }


def _triage_with_llm(contracts: list) -> list:
    try:
        findings = run_dspy_cached(
            _predictor,
            _CACHE_NS,
            lm=_LM,
            output_field="findings",
            contracts_json=json.dumps(contracts, indent=2),
        )
    except Exception as exc:
        logger.error("Solidity triage LLM failed: %s", exc)
        return []

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])

    return findings[:_MAX_FINDINGS]
