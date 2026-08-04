import json
import structlog
import os
import uuid

import httpx

from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import LLM_MODEL, get_llm

logger = structlog.get_logger(__name__)

_SIDECAR_BASE = os.getenv("SIDECAR_URL", "http://127.0.0.1:8003")
_LLM = get_llm(temperature_key="security", json_mode=True)
_CACHE_NS = f"{LLM_MODEL}:solidity:json"
_MAX_FINDINGS = 40

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


def solidity_agent(state: dict) -> dict:
    sol_files = [f for f in state.get("file_tree", []) if f.endswith(".sol")]
    if not sol_files:
        return {"solidity_audit": None}

    contents = state.get("file_contents", {})
    parsed_contracts = []

    with httpx.Client(timeout=30) as client:
        for path in sol_files:
            source = contents.get(path, "")
            if not source:
                continue
            try:
                resp = client.post(
                    f"{_SIDECAR_BASE}/parse",
                    json={"source": source},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    parsed_contracts.extend(data.get("contracts", []))
                else:
                    logger.warning("sidecar %s returned %d", path, resp.status_code)
            except httpx.RequestError as exc:
                logger.error("sidecar unreachable: %s", exc)
                return {"solidity_audit": _fallback_finding()}

    if not parsed_contracts:
        return {"solidity_audit": None}

    findings = _triage_with_llm(parsed_contracts)
    return {"solidity_audit": {"contracts": parsed_contracts, "findings": findings}}


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
            return _fallback_finding()["findings"]

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])

    return findings[:_MAX_FINDINGS]


def _fallback_finding() -> dict:
    return {
        "contracts": [],
        "findings": [
            {
                "id": "sol-demo-01",
                "contract": "unknown",
                "function": "unknown",
                "severity": "high",
                "title": "Sidecar unavailable — manual review recommended",
                "description": "Solidity parser sidecar did not respond. No automated AST analysis performed.",
                "remediation": "Check rust-sidecar is running on port 8003 or review .sol files manually.",
                "swc": None,
            }
        ],
    }
