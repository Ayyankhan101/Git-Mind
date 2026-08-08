"""
Integration layer: connects ML classifier to Git-Mind's Solidity agent.
Replaces LLM-only analysis with hybrid ML + LLM approach.
"""
import time
from typing import Optional

# ML classifier (lazy-loaded)
_ml_classifier = None


def _get_classifier():
    global _ml_classifier
    if _ml_classifier is None:
        try:
            from .inference import classify_solidity as _classify
            _ml_classifier = _classify
        except ImportError:
            # Fallback: ML dependencies not installed
            return None
    return _ml_classifier


# ── SWC mapping ───────────────────────────────────────────────────────
SWC_MAP = {
    "reentrancy": "SWC-107",
    "integer_overflow": "SWC-101",
    "access_control": "SWC-105",
    "unsafe_external_call": "SWC-104",
    "front_running": "SWC-114",
    "gas_griefing": "SWC-113",
    "safe": None,
}

SEVERITY_MAP = {
    "reentrancy": "critical",
    "integer_overflow": "high",
    "access_control": "high",
    "unsafe_external_call": "high",
    "front_running": "medium",
    "gas_griefing": "medium",
    "safe": "none",
}


def enhance_findings(findings: list[dict], contract_code: str) -> list[dict]:
    """
    Enhance LLM findings with ML classifier predictions.

    If ML classifier is available, cross-reference predictions with LLM findings.
    If ML detects a vulnerability the LLM missed, add it.
    """
    classifier = _get_classifier()
    if classifier is None:
        return findings

    # Run ML classification on full contract
    try:
        ml_result = classifier(contract_code)
    except Exception:
        return findings

    ml_label = ml_result.get("label", "safe")

    if ml_label == "safe":
        return findings

    # Check if LLM already found this vulnerability type
    existing_types = {f.get("label", "").lower() for f in findings}

    if ml_label not in existing_types:
        # ML found something LLM missed — add it
        new_finding = {
            "id": f"ml_{ml_label[:8]}",
            "contract": "Unknown",
            "function": "N/A",
            "severity": ml_result.get("severity", SEVERITY_MAP.get(ml_label, "medium")),
            "title": f"ML: {ml_label.replace('_', ' ').title()}",
            "description": ml_result.get("explanation", f"ML classifier detected {ml_label}"),
            "remediation": f"Review contract for {ml_label} vulnerability patterns",
            "swc": SWC_MAP.get(ml_label),
            "source": "ml_classifier",
            "confidence": ml_result.get("confidence", 0.85),
        }
        findings.append(new_finding)

    # Add ML confidence to existing findings of same type
    for finding in findings:
        if finding.get("label", "").lower() == ml_label or ml_label in finding.get("title", "").lower():
            finding["ml_confidence"] = ml_result.get("confidence", 0.85)

    return findings


def classify_contract_functions(functions: list[dict], code: str) -> list[dict]:
    """
    Classify individual functions within a contract.
    Returns list of function-level findings.
    """
    classifier = _get_classifier()
    if classifier is None:
        return []

    findings = []

    # Extract function bodies from code (simplified)
    for func in functions:
        func_name = func.get("name", "")
        if not func_name:
            continue

        # Find function in code
        try:
            # Simple extraction between function signature and next }
            start = code.find(f"function {func_name}")
            if start < 0:
                continue

            depth = 0
            end = start
            for i, ch in enumerate(code[start:], start):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break

            func_code = code[start:end]
            if len(func_code) < 20:
                continue

            result = classifier(func_code)
            if result.get("label", "safe") != "safe":
                findings.append({
                    "function": func_name,
                    "label": result["label"],
                    "severity": result.get("severity", SEVERITY_MAP.get(result["label"], "medium")),
                    "explanation": result.get("explanation", ""),
                    "swc": SWC_MAP.get(result["label"]),
                })
        except Exception:
            continue

    return findings


def get_ml_health() -> dict:
    """Check ML classifier health."""
    classifier = _get_classifier()
    if classifier is None:
        return {"status": "not_available", "reason": "ML dependencies not installed"}

    try:
        from .inference import health_check
        return health_check()
    except Exception as e:
        return {"status": "error", "error": str(e)}
