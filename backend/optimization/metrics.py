"""Per-agent metrics for MIPROv2 + the promotion gate.

``make_metric(agent)`` returns ``metric(gold, pred, trace=None) -> float`` in
[0, 1]. Structural validity reuses the same Pydantic output models the agents
already validate against, so the metric can never reward malformed output.
Semantic scoring follows the spec's rubric per agent: finding overlap
(security / solidity / language_audit), route/method match (api_doc),
risk/confidence agreement (impact), verdict match (pr_review), and node-name
overlap (architecture).
"""

from __future__ import annotations

import re
from collections.abc import Callable

from pydantic import BaseModel

from optimization.registry import get_spec

SEVERITIES = frozenset({"low", "medium", "high", "critical"})
VERDICTS = frozenset({"APPROVE", "REQUEST CHANGES", "NEEDS DISCUSSION"})


# ── Structural validity ───────────────────────────────────────────────────────


def validate_output(agent: str, pred) -> bool:
    """Structural validity of a program output payload (dict / list / str)."""
    spec = get_spec(agent)
    if spec.output_model is None:  # architecture — plain Mermaid string
        ok = isinstance(pred, str) and pred.strip().startswith("graph ")
    elif spec.output_list:
        ok = isinstance(pred, list) and all(_valid_one(spec, p) for p in pred)
    else:
        ok = _valid_one(spec, pred)
    return ok and _extra_structural(agent, pred)


def _valid_one(spec, value) -> bool:
    try:
        spec.output_model.model_validate(value)  # type: ignore[arg-type]
        return True
    except Exception:
        return False


def _extra_structural(agent: str, pred) -> bool:
    """Contract-level checks the Pydantic models don't encode."""
    if agent == "pr_review" and isinstance(pred, dict):
        return str(pred.get("verdict", "")).strip().upper() in VERDICTS
    if agent in ("security", "solidity", "language_audit") and isinstance(pred, list):
        return all(
            str(f.get("severity", "")).lower() in SEVERITIES
            for f in pred
            if isinstance(f, dict)
        )
    return True


def _normalize(value):
    """Deep-convert pydantic models to plain JSON data (dict/list/str)."""
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize(v) for v in value]
    return value


# ── Semantic scoring ──────────────────────────────────────────────────────────


def make_metric(agent: str) -> Callable:
    """Return the agent's metric: metric(gold, pred, trace=None) -> float."""
    spec = get_spec(agent)
    scorer = _SCORERS.get(agent)
    if scorer is None:  # findings agents — bind the agent for the location field

        def scorer(g, p, _a=agent):
            return _score_findings(_a, g, p)

    def metric(gold, pred, _trace=None) -> float:
        g = _normalize(_extract_output(spec, gold))
        p = _normalize(_extract_output(spec, pred))
        if not validate_output(agent, p):
            return 0.0
        return scorer(g, p)

    return metric


def _extract_output(spec, obj):
    """Pull the output-field value out of a dspy.Prediction / Example / dict.

    A plain payload (dict/list/str) is returned as-is; a full-output dict that
    carries the field key (e.g. {"prediction": {...}}) is unwrapped.
    """
    val = getattr(obj, spec.output_field, None)
    if val is not None:
        return val
    if isinstance(obj, dict) and spec.output_field in obj:
        return obj[spec.output_field]
    return obj


def _finding_key(agent: str, f: dict) -> tuple:
    """Rubric fields for one finding: (severity, title, location...)."""
    sev = str(f.get("severity", "")).lower()
    title = str(f.get("title", "")).strip().casefold()
    if agent == "solidity":
        return (sev, title, str(f.get("contract", "")), str(f.get("function", "")))
    if agent == "language_audit":
        return (sev, title, str(f.get("file", "")), f.get("line"))
    return (sev, title, str(f.get("file", "")), f.get("line_start"))


def _score_findings(agent: str, gold, pred) -> float:
    """Fraction of gold findings matched on (severity, title, location)."""
    if not gold:
        return 1.0 if not pred else 0.0
    gold_keys = {_finding_key(agent, f) for f in gold if isinstance(f, dict)}
    if not gold_keys:
        return 1.0
    pred_keys = {_finding_key(agent, f) for f in pred if isinstance(f, dict)}
    return len(gold_keys & pred_keys) / len(gold_keys)


def _score_api_doc(gold, pred) -> float:
    if not gold:
        return 1.0 if not pred else 0.0
    gold_keys = {
        (str(e.get("method", "")).upper(), str(e.get("route", "")))
        for e in gold
        if isinstance(e, dict)
    }
    if not gold_keys:
        return 1.0
    pred_keys = {
        (str(e.get("method", "")).upper(), str(e.get("route", "")))
        for e in pred
        if isinstance(e, dict)
    }
    return len(gold_keys & pred_keys) / len(gold_keys)


def _score_impact(gold, pred) -> float:
    risk = (
        0.5
        if str(gold.get("merge_risk", "")).lower()
        == str(pred.get("merge_risk", "")).lower()
        else 0.0
    )
    conf = (
        0.25
        if str(gold.get("confidence", "")).lower()
        == str(pred.get("confidence", "")).lower()
        else 0.0
    )
    ga = {
        str(x).strip().casefold()
        for x in gold.get("affected_areas", [])
        if isinstance(x, str)
    }
    pa = {
        str(x).strip().casefold()
        for x in pred.get("affected_areas", [])
        if isinstance(x, str)
    }
    overlap = len(ga & pa) / len(ga) if ga else 1.0
    return risk + conf + 0.25 * overlap


def _score_pr_review(gold, pred) -> float:
    gv = str(gold.get("verdict", "")).strip().upper()
    pv = str(pred.get("verdict", "")).strip().upper()
    verdict = 0.7 if gv == pv else 0.0
    g_lines = {
        (str(i.get("file", "")), i.get("line"))
        for i in gold.get("issues", [])
        if isinstance(i, dict)
    }
    p_lines = {
        (str(i.get("file", "")), i.get("line"))
        for i in pred.get("issues", [])
        if isinstance(i, dict)
    }
    issue = (
        (0.3 if not p_lines else 0.0)
        if not g_lines
        else 0.3 * len(g_lines & p_lines) / len(g_lines)
    )
    return verdict + issue


def _score_architecture(gold, pred) -> float:
    g_nodes = _node_names(gold)
    p_nodes = _node_names(pred)
    if not g_nodes:
        return 1.0 if not p_nodes else 0.0
    if not p_nodes:
        return 0.0
    return len(g_nodes & p_nodes) / len(g_nodes)


def _node_names(diagram: str) -> set[str]:
    """Node ids from a Mermaid flowchart, e.g. `frontend[React] -->|HTTP| backend[API]`."""
    names: set[str] = set()
    for line in str(diagram).splitlines():
        for m in re.finditer(r"(\w+)\[", line):
            names.add(m.group(1).casefold())
    return names


# The three findings agents share the (severity, title, location) rubric; the
# location field differs but the key construction tolerates it.
_SCORERS: dict[str, Callable] = {
    "api_doc": _score_api_doc,
    "impact": _score_impact,
    "pr_review": _score_pr_review,
    "architecture": _score_architecture,
}
