"""DSPy program validation tests for the 7 structured-output agents.

Each agent runs a typed DSPy program whose output is validated against a
Pydantic model. These tests drive the *real* programs with a fake LM that
returns canned responses and assert that malformed output — invalid JSON,
missing keys, wrong types — is rejected instead of shipping silently, and
that each agent degrades to its documented fallback when that happens.
"""

import json
from copy import deepcopy

import pytest
from dspy import AdapterParseError, BaseLM
from pydantic import ValidationError

import agents.api_doc as _api_doc
import agents.architecture as _architecture
import agents.impact as _impact
import agents.language_audit as _language_audit
import agents.pr_review as _pr_review
import agents.security as _security
import agents.solidity_agent as _solidity
from llm_cache import run_dspy_cached

# ── Fake LM ──────────────────────────────────────────────────────────────────


class FakeLM(BaseLM):
    """A dspy LM that returns one canned response, no network involved."""

    def __init__(self, response: str):
        super().__init__(model="fake/test", model_type="chat", temperature=0.0)
        self.response = response
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return [self.response]


GARBAGE = "this is not json"


# ── Program table ─────────────────────────────────────────────────────────────

_PROGRAMS = [
    {
        "name": "security",
        "predictor": _security._predictor,
        "output_field": "findings",
        "inputs": {"raw_findings": json.dumps([{"check_id": "x", "path": "a.py"}])},
        "valid": {
            "findings": [
                {
                    "id": "f1",
                    "file": "a.py",
                    "line_start": 1,
                    "line_end": 2,
                    "severity": "high",
                    "title": "T",
                    "exploit_story": "E",
                    "remediation": "R",
                    "cwe": "CWE-1",
                }
            ]
        },
        "valid_type": list,
        "missing_path": ["findings", 0, "remediation"],
        "missing_error": ValidationError,
        "wrong_path": ["findings", 0, "line_start"],
        "wrong_value": "abc",
    },
    {
        "name": "api_doc",
        "predictor": _api_doc._predictor,
        "output_field": "endpoints",
        "inputs": {"source_code": "file: x\n"},
        "valid": {
            "endpoints": [
                {
                    "method": "GET",
                    "route": "/users/:id",
                    "description": "Get user",
                    "parameters": "id: int",
                    "auth_required": True,
                }
            ]
        },
        "valid_type": list,
        "missing_path": ["endpoints", 0, "method"],
        "missing_error": ValidationError,
        "wrong_path": ["endpoints", 0, "auth_required"],
        "wrong_value": "maybe",  # "yes"/"no"/"true" coerce; "maybe" must fail
    },
    {
        "name": "impact",
        "predictor": _impact._predictor,
        "output_field": "prediction",
        "inputs": {"context": "PR diff"},
        "valid": {
            # ChainOfThought emits a required `reasoning` field alongside the output
            "reasoning": "Because the diff is small.",
            "prediction": {
                "merge_risk": "low",
                "recommendation": "Safe to merge",
                "one_liner": "Ok",
                "affected_areas": ["Auth"],
                "breaking_changes": [],
                "narrative": "Nothing regresses.",
                "confidence": "high",
            },
        },
        "valid_type": dict,
        "missing_path": ["prediction", "narrative"],
        "missing_error": ValidationError,
        "wrong_path": ["prediction", "affected_areas"],
        "wrong_value": "Auth",
    },
    {
        "name": "solidity",
        "predictor": _solidity._predictor,
        "output_field": "findings",
        "inputs": {"contracts_json": json.dumps([{"name": "Token"}])},
        "valid": {
            "findings": [
                {
                    "id": "f1",
                    "contract": "Token",
                    "function": "transfer",
                    "severity": "high",
                    "title": "Reentrancy",
                    "description": "D",
                    "remediation": "R",
                    "swc": "SWC-107",
                }
            ]
        },
        "valid_type": list,
        "missing_path": ["findings", 0, "contract"],
        "missing_error": ValidationError,
        "wrong_path": ["findings", 0, "swc"],
        "wrong_value": {"bad": 1},
    },
    {
        "name": "language_audit",
        "predictor": _language_audit._predictor,
        "output_field": "findings",
        "inputs": {"guidance": "g", "context": "{}"},
        "valid": {
            "findings": [
                {
                    "id": "f1",
                    "file": "a.py",
                    "line": 1,
                    "severity": "medium",
                    "title": "T",
                    "description": "D",
                    "remediation": "R",
                }
            ]
        },
        "valid_type": list,
        "missing_path": ["findings", 0, "severity"],
        "missing_error": ValidationError,
        "wrong_path": ["findings", 0, "line"],
        "wrong_value": "x",
    },
    {
        "name": "pr_review",
        "predictor": _pr_review._predictor,
        "output_field": "review",
        "inputs": {"pr_context": "ctx"},
        "valid": {
            "reasoning": "Because of the auth gap.",
            "review": {
                "summary": "S",
                "issues": [
                    {
                        "file": "a.py",
                        "line": 1,
                        "severity": "HIGH",
                        "title": "T",
                        "explanation": "E",
                    }
                ],
                "verdict": "APPROVE",
                "verdict_justification": "J",
            },
        },
        "valid_type": dict,
        "missing_path": ["review", "verdict"],
        "missing_error": ValidationError,
        "wrong_path": ["review", "issues"],
        "wrong_value": "none",
    },
    {
        "name": "architecture",
        "predictor": _architecture._predictor,
        "output_field": "diagram",
        "inputs": {"context": "file tree"},
        "valid": {"diagram": "graph TD\n    A[B]"},
        "valid_type": str,
        # The `diagram` field is a top-level str — a missing key is an adapter
        # failure, and any JSON value is stringified (pydantic lax str), so there
        # is no wrong-type case for this program.
        "missing_path": ["diagram"],
        "missing_error": AdapterParseError,
        "wrong_path": None,
        "wrong_value": None,
    },
]


def _drop_key(payload: dict, path: list) -> dict:
    node = deepcopy(payload)
    cur = node
    for part in path[:-1]:
        cur = cur[part]
    del cur[path[-1]]
    return node


def _set_key(payload: dict, path: list, value) -> dict:
    node = deepcopy(payload)
    cur = node
    for part in path[:-1]:
        cur = cur[part]
    cur[path[-1]] = value
    return node


def _run(case: dict, response: str):
    return run_dspy_cached(
        case["predictor"],
        f"dspy-test:{case['name']}",
        lm=FakeLM(response),
        output_field=case["output_field"],
        **case["inputs"],
    )


# ── Validation rejection tests ────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _no_cache():
    """Never hit the real Redis/diskcache LLM cache from these tests."""
    from unittest.mock import patch

    with (
        patch("llm_cache.get_cached", return_value=None),
        patch("llm_cache.set_cached"),
        patch("llm_cache._record_harvest"),  # fake LMs must not pollute the harvest log
    ):
        yield


@pytest.mark.parametrize("case", _PROGRAMS, ids=lambda c: c["name"])
def test_valid_output_parses(case):
    out = _run(case, json.dumps(case["valid"]))
    assert isinstance(out, case["valid_type"])
    assert out  # non-empty payload


@pytest.mark.parametrize("case", _PROGRAMS, ids=lambda c: c["name"])
def test_invalid_json_rejected(case):
    with pytest.raises(AdapterParseError):
        _run(case, GARBAGE)


@pytest.mark.parametrize("case", _PROGRAMS, ids=lambda c: c["name"])
def test_empty_object_rejected(case):
    with pytest.raises(AdapterParseError):
        _run(case, "{}")


@pytest.mark.parametrize("case", _PROGRAMS, ids=lambda c: c["name"])
def test_missing_key_rejected(case):
    payload = _drop_key(case["valid"], case["missing_path"])
    with pytest.raises(case["missing_error"]):
        _run(case, json.dumps(payload))


@pytest.mark.parametrize("case", [c for c in _PROGRAMS if c["wrong_path"]], ids=lambda c: c["name"])
def test_wrong_type_rejected(case):
    payload = _set_key(case["valid"], case["wrong_path"], case["wrong_value"])
    with pytest.raises(ValidationError):
        _run(case, json.dumps(payload))


# ── Agent fallback tests ──────────────────────────────────────────────────────
# A malformed model response must never ship silently: each agent catches the
# validation/parse failure and returns its documented fallback.


def test_security_falls_back_to_synthetic_finding():
    from unittest.mock import patch

    from agents import security

    with patch.object(security, "_LM", FakeLM(GARBAGE)):
        findings = security._triage_with_llm(
            [
                {
                    "check_id": "python.lang.security.audit.dangerous-system-call",
                    "path": "src/main.py",
                    "start": {"line": 12},
                    "end": {"line": 12},
                    "extra": {"message": "shell=True", "severity": "ERROR"},
                }
            ]
        )
    assert findings == security._synthetic_finding()
    assert findings[0]["id"] == "demo01"


def test_api_doc_falls_back_to_empty_endpoints():
    from unittest.mock import patch

    from agents import api_doc

    contents = {
        "routes/users.py": (
            "from fastapi import APIRouter\n"
            "router = APIRouter()\n"
            "\n"
            "@router.get('/users/{uid}')\n"
            "def get_user(uid: int):\n"
            "    return {'uid': uid}\n"
        )
    }
    with patch.object(api_doc, "_LM", FakeLM(GARBAGE)):
        result = api_doc.run_api_doc_agent(contents)
    assert result == []


def test_impact_falls_back_to_safe_prediction():
    from unittest.mock import patch

    from agents import impact

    with patch.object(impact, "_LM", FakeLM(GARBAGE)):
        result = impact.run_merge_prediction(
            "diff",
            {
                "new_findings": [],
                "fixed_findings": [],
                "new_cves": [],
                "fixed_cves": [],
                "health_delta": 0,
                "base_score": 80,
                "base_grade": "B",
                "pr_score": 80,
                "pr_grade": "B",
                "breakdown_delta": {},
            },
            {
                "base_branch": "main",
                "owner": "o",
                "repo": "r",
                "pr_num": "1",
                "title": "t",
                "additions": 1,
                "deletions": 0,
                "changed_files": 1,
            },
        )
    assert result["merge_risk"] == "medium"
    assert result["confidence"] == "low"
    assert result["recommendation"] == "Merge with caution"


def test_solidity_falls_back_to_empty_findings():
    from unittest.mock import patch

    from agents import solidity_agent

    with patch.object(solidity_agent, "_LM", FakeLM(GARBAGE)):
        result = solidity_agent._triage_with_llm([{"name": "Token"}])
    assert result == []


def test_language_audit_falls_back_to_empty_findings():
    from unittest.mock import patch

    from agents import language_audit

    with patch.object(language_audit, "_LM", FakeLM(GARBAGE)):
        result = language_audit._triage_with_llm(
            language_audit._PYTHON_PROMPT,
            [{"file": "src/main.py", "message": "unused import", "rule": "W0611", "line": 1}],
            "python",
        )
    assert result == []


def test_pr_review_falls_back_to_degraded_review():
    from unittest.mock import patch

    from agents import pr_review

    fake_pr = {
        "owner": "o",
        "repo": "r",
        "pr_num": "1",
        "title": "Fix bug",
        "body": "Fixes the thing",
        "author": "dev",
        "base_branch": "main",
        "head_sha": "abc123",
        "changed_files": 1,
        "additions": 2,
        "deletions": 0,
        "diff": "diff --git a/a.py b/a.py\n+print(1)\n",
        "diff_truncated": False,
    }
    with (
        patch.object(pr_review, "fetch_pr_data", return_value=fake_pr),
        patch.object(pr_review, "_LM", FakeLM(GARBAGE)),
    ):
        result = pr_review.run_pr_review("https://github.com/o/r/pull/1")

    assert result["review"].startswith("## Summary")
    assert "could not be generated" in result["review"]


def test_architecture_falls_back_to_incomplete_diagram():
    from unittest.mock import patch

    from agents import architecture

    with patch.object(architecture, "_LM", FakeLM(GARBAGE)):
        result = architecture.run_architecture_agent(
            ["src/main.py"],
            {"src/main.py": "print('hello')\n"},
        )
    assert result == "graph TD\n    src[Source Code (1 files)]"
