"""Trainsets for self-optimization — two sources, one ``dspy.Example`` shape.

Source A — the live telemetry log. ``llm_cache.run_dspy_cached`` appends one
JSONL record per real LLM call (cache miss only): {sig, inputs, output}.
``harvest()`` replays that log into ``dspy.Example(**inputs, **{output_field:
output}).with_inputs(*input_fields)`` — the same shape the program already
accepts, so no labeling effort. These are *model-generated* labels: they power
bootstrapping more than grading.

Source B — curated gold sets in ``optimization/gold/<agent>.json``, used as the
valset that decides promotion. Every entry is validated against the program's
Pydantic output model at load; invalid entries are rejected with a warning,
never silently included.
"""

from __future__ import annotations

import json
from pathlib import Path

import structlog

from dspy_setup import dspy
from llm_cache import _harvest_path
from optimization.metrics import validate_output
from optimization.registry import get_spec

logger = structlog.get_logger(__name__)

GOLD_DIR = Path(__file__).resolve().parent / "gold"


def harvest(agent: str, limit: int = 200) -> list:
    """Replay the agent's telemetry log into a list of dspy.Example trainsets."""
    spec = get_spec(agent)
    path = _harvest_path(agent)
    if not path.exists():
        logger.debug("no harvest log for %s at %s", agent, path)
        return []

    examples: list = []
    seen: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        ex = _record_to_example(spec, rec)
        if ex is None:
            continue
        key = json.dumps(rec.get("inputs", {}), sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        examples.append(ex)
        if len(examples) >= limit:
            break
    return examples


def _record_to_example(spec, rec: dict) -> object | None:
    inputs = rec.get("inputs")
    output = rec.get("output")
    if not isinstance(inputs, dict) or output is None:
        return None
    if any(f not in inputs for f in spec.input_fields):
        return None
    if not validate_output(spec.name, output):
        return None
    return dspy.Example(**inputs, **{spec.output_field: output}).with_inputs(*spec.input_fields)


def load_gold(agent: str) -> list:
    """Load optimization/gold/<agent>.json into validated dspy.Example valsets."""
    spec = get_spec(agent)
    path = GOLD_DIR / f"{agent}.json"
    if not path.exists():
        logger.warning("no gold set for %s at %s", agent, path)
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("gold set %s unreadable: %s", agent, exc)
        return []
    if not isinstance(raw, list):
        logger.warning("gold set %s is not a JSON list", agent)
        return []

    examples: list = []
    for i, entry in enumerate(raw, 1):
        ex = _entry_to_example(spec, entry)
        if ex is None:
            logger.warning("gold %s entry %d rejected — fails %s validation", agent, i, spec.output_field)
            continue
        examples.append(ex)
    return examples


def _entry_to_example(spec, entry) -> object | None:
    if not isinstance(entry, dict):
        return None
    return _record_to_example(spec, entry)
