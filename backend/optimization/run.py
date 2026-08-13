"""One-agent-per-run self-optimization entry point.

Pipeline per invocation: harvest a trainset from the live telemetry log →
load the curated gold valset → score the *current* program as baseline →
MIPROv2 compile (``auto="light"``) → score the optimized program on the same
valset → promote (versioned artifact directory + active.json) only when it
beats the baseline by the margin — never on churn.

Usage (from ``backend/``):

    venv/bin/python -m optimization.run --agent security --budget 40000

``--budget`` is the remaining daily token window; the run aborts before
compiling when the estimate exceeds it. Without ``--budget`` (or the
``GROQ_DAILY_REMAINING`` env var) the guard is disabled with a warning —
intended for manual deep-tuning only.
"""

from __future__ import annotations

import argparse
import os
import time
from collections.abc import Sequence
from pathlib import Path

import structlog

from dspy_setup import dspy
from optimization import budget, registry
from optimization.budget import estimate_compile_tokens, guard_budget
from optimization.metrics import make_metric
from optimization.trainsets import harvest, load_gold
from settings import get_dspy_lm

logger = structlog.get_logger(__name__)

# Same per-use-case temperatures the agents use at runtime.
AGENT_TEMP_KEYS = {
    "security": "security",
    "solidity": "security",
    "api_doc": "analysis",
    "language_audit": "code_audit",
    "pr_review": "pr_review",
    "impact": "impact",
    "architecture": "analysis",
}

DEFAULT_MARGIN = 0.05  # only promote on measured improvement, never on churn
DEFAULT_MAX_BOOTSTRAPPED_DEMOS = 4
DEFAULT_MAX_LABELED_DEMOS = 4


def _evaluate(program, devset, metric) -> float:
    # dspy 3.3.0 requires `devset` in the Evaluate constructor, not __call__.
    evaluator = dspy.Evaluate(metric=metric, devset=devset)
    return float(evaluator(program))


def _evaluate_in_context(lm, program, devset, metric) -> float:
    """Evaluate with the LM active — dspy.Evaluate runs the program, which
    calls the LM. Outside dspy.context(lm=...) every example fails with
    'No LM is loaded' (live run 2026-08-13: baseline crashed exactly there)."""
    with dspy.context(lm=lm):
        return _evaluate(program, devset, metric)


def _should_promote(baseline: float, score: float, margin: float = DEFAULT_MARGIN) -> bool:
    """Gate: the optimized program must beat the current one by ``margin``."""
    return score >= baseline + margin


def compile_agent(
    agent: str,
    *,
    trainset,
    valset,
    remaining_budget: int | None = None,
    auto: str = "light",
    margin: float = DEFAULT_MARGIN,
    max_bootstrapped_demos: int = DEFAULT_MAX_BOOTSTRAPPED_DEMOS,
    max_labeled_demos: int = DEFAULT_MAX_LABELED_DEMOS,
    num_candidates: int | None = None,
    num_trials: int | None = None,
    avg_input_tokens: int = budget.DEFAULT_AVG_INPUT_TOKENS,
) -> Path | None:
    """Compile one agent and promote the result if it beats the baseline.

    Returns the artifact path on promotion, ``None`` when the gate rejects it
    (or the budget guard aborts the run). ``num_candidates``/``num_trials`` are
    only honored when ``auto=None`` (auto overrides them — passing both raises).
    ``avg_input_tokens`` calibrates the pre-compile token estimate for the
    agent's real input size.
    """
    estimate = estimate_compile_tokens(len(trainset), auto=auto, avg_input_tokens=avg_input_tokens)
    ok, reason = guard_budget(agent, estimate, remaining_budget)
    logger.info("budget check %s: %s", agent, reason)
    if not ok:
        return None

    metric = make_metric(agent)
    temp_key = AGENT_TEMP_KEYS.get(agent, "analysis")
    lm = get_dspy_lm(temperature_key=temp_key)

    current = registry.load_program(agent)
    baseline = _evaluate_in_context(lm, current, valset, metric)
    logger.info("%s baseline on valset: %.3f", agent, baseline)

    student = registry.build_program(agent)  # fresh — MIPROv2 may mutate/replace it
    tp_kwargs: dict = {
        "metric": metric,
        "task_model": lm,
        "prompt_model": lm,
        "auto": auto,
        "max_bootstrapped_demos": max_bootstrapped_demos,
        "max_labeled_demos": max_labeled_demos,
        "seed": 9,
        "verbose": False,
        "track_stats": True,
    }
    compile_kwargs: dict = {
        "trainset": trainset,
        "valset": valset,
        # MIPROv2 defaults to minibatch_size=35, larger than our gold sets.
        "minibatch_size": min(len(valset), 35),
    }
    if auto is None:
        if num_candidates is not None:
            tp_kwargs["num_candidates"] = num_candidates
        if num_trials is not None:
            compile_kwargs["num_trials"] = num_trials
    elif num_candidates is not None or num_trials is not None:
        logger.warning(
            "num_candidates/num_trials ignored — auto=%r overrides them (dspy raises when both are set)", auto
        )
    with dspy.context(lm=lm):
        tp = dspy.MIPROv2(**tp_kwargs)
        optimized = tp.compile(student, **compile_kwargs)

    score = _evaluate_in_context(lm, optimized, valset, metric)
    logger.info("%s optimized score on valset: %.3f (baseline %.3f)", agent, score, baseline)

    if not _should_promote(baseline, score, margin):
        logger.info("%s NOT promoted — score %.3f < baseline %.3f + margin %.3f", agent, score, baseline, margin)
        return None

    ts = time.strftime("%Y%m%d-%H%M%S")
    out = registry.OPT_DIR / f"{agent}-{ts}"
    optimized.save(str(out), save_program=True)
    registry.promote(agent, out)
    logger.info("%s promoted -> %s (score %.3f, baseline %.3f)", agent, out, score, baseline)
    return out


def _env_remaining() -> int | None:
    """Remaining daily window from GROQ_DAILY_REMAINING (0/unset ⇒ None)."""
    try:
        val = int(os.environ.get("GROQ_DAILY_REMAINING", "0") or 0)
    except ValueError:
        return None
    return val or None


def _register_agents() -> None:
    """Import the 7 agent modules so their programs land in the registry."""
    import agents.api_doc  # noqa: F401
    import agents.architecture  # noqa: F401
    import agents.impact  # noqa: F401
    import agents.language_audit  # noqa: F401
    import agents.pr_review  # noqa: F401
    import agents.security  # noqa: F401
    import agents.solidity_agent  # noqa: F401


def main(argv: Sequence[str] | None = None) -> int:
    from dotenv import load_dotenv

    load_dotenv()  # CLI runs standalone — main.py / live_dspy_e2e do the same
    _register_agents()  # CLI runs standalone — nothing else imports the agents
    ap = argparse.ArgumentParser(description="MIPROv2 self-optimization for one agent")
    target = ap.add_mutually_exclusive_group(required=True)
    target.add_argument("--agent", choices=registry.agent_names(), help="which program to optimize (compile + gate + promote)")
    target.add_argument(
        "--rollback",
        metavar="AGENT",
        choices=registry.agent_names(),
        help="revert one agent to its previous promoted artifact (from active.json rollback history) and exit",
    )
    ap.add_argument("--limit", type=int, default=200, help="max telemetry examples to harvest as trainset")
    ap.add_argument(
        "--budget",
        type=int,
        default=None,
        help="remaining daily token budget (defaults to GROQ_DAILY_REMAINING env; unguarded otherwise)",
    )
    ap.add_argument(
        "--auto",
        default="light",
        choices=("light", "medium", "heavy", "none"),
        help="MIPROv2 auto mode; 'none' enables --candidates/--trials (deep tuning)",
    )
    ap.add_argument("--candidates", type=int, default=None, help="num_candidates (only with --auto none)")
    ap.add_argument("--trials", type=int, default=None, help="num_trials (only with --auto none)")
    ap.add_argument("--demos", type=int, default=None, help="max bootstrapped+labeled demos (budget control)")
    ap.add_argument(
        "--avg-input-tokens",
        type=int,
        default=budget.DEFAULT_AVG_INPUT_TOKENS,
        help="calibrate the pre-compile token estimate to the agent's real input size",
    )
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN)
    ap.add_argument("--min-gold", type=int, default=2, help="minimum gold valset size required to run")
    args = ap.parse_args(argv)

    if args.rollback:
        restored = registry.rollback(args.rollback)
        if restored:
            logger.info("rolled back %s -> %s", args.rollback, restored)
            print(f"rolled back {args.rollback} -> {restored}")
            return 0
        logger.warning("no rollback available for %s (no previous artifact in history)", args.rollback)
        print(f"{args.rollback}: no rollback available — no previous promoted artifact")
        return 1

    remaining = args.budget if args.budget is not None else (_env_remaining() or None)
    if remaining is None:
        logger.warning("no remaining-budget info — run unguarded (manual deep-tuning only)")

    trainset = harvest(args.agent, limit=args.limit)
    valset = load_gold(args.agent)
    logger.info("agent=%s trainset=%d valset=%d", args.agent, len(trainset), len(valset))

    if not trainset:
        logger.warning("empty trainset — nothing to learn from yet (run the live agents first)")
        return 1
    if len(valset) < args.min_gold:
        logger.warning("gold valset too small (%d < %d) — refusing to gate on it", len(valset), args.min_gold)
        return 1

    out = compile_agent(
        args.agent,
        trainset=trainset,
        valset=valset,
        remaining_budget=remaining,
        auto=(None if args.auto == "none" else args.auto),
        margin=args.margin,
        max_bootstrapped_demos=args.demos if args.demos is not None else DEFAULT_MAX_BOOTSTRAPPED_DEMOS,
        max_labeled_demos=args.demos if args.demos is not None else DEFAULT_MAX_LABELED_DEMOS,
        num_candidates=args.candidates,
        num_trials=args.trials,
        avg_input_tokens=args.avg_input_tokens,
    )
    if out:
        print(f"promoted {args.agent} -> {out}")
    else:
        print(f"{args.agent}: no promotion (gate rejected or budget guard aborted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
