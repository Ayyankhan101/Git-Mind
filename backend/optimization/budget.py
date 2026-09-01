"""Token-budget guard for MIPROv2 compile runs.

A live ``auto="light"`` compile burns thousands of tokens: bootstrap demos,
instruction proposals, and candidate evaluation all run the LM over the
trainset. The on-demand Groq daily window (100K TPD) binds fast, so compile
runs are sized *before* they start and aborted when they would exceed the
remaining window. These are deliberately rough upper bounds — the point is to
fail closed, not to be exact.
"""

from __future__ import annotations

# Rough candidate counts per `auto` level (MIPROv2 scales candidates/trials).
_CANDIDATES = {"light": 8, "medium": 16, "heavy": 32}
# Average tokens per program call on a real repo context (inputs are large:
# diffs, source files, file trees).
DEFAULT_AVG_INPUT_TOKENS = 2_000


def estimate_compile_tokens(
    trainset_size: int,
    *,
    auto: str | None = "light",
    max_bootstrapped_demos: int = 4,
    max_labeled_demos: int = 4,
    avg_input_tokens: int = DEFAULT_AVG_INPUT_TOKENS,
) -> int:
    """Rough upper-bound token estimate for one MIPROv2 compile.

    Bootstrapping evaluates the student over the trainset with up to
    (bootstrapped + labeled) demos; candidate search then evaluates each
    candidate over the trainset. Both scale with trainset × avg_input_tokens.
    """
    candidates = _CANDIDATES.get(auto or "light", 8)
    bootstrap = (
        trainset_size * (max_bootstrapped_demos + max_labeled_demos) * avg_input_tokens
    )
    search = candidates * trainset_size * avg_input_tokens
    return bootstrap + search


def guard_budget(agent: str, estimate: int, remaining: int | None) -> tuple[bool, str]:
    """Return ``(ok, reason)``. ``remaining`` is the daily window left in tokens;
    ``None`` disables the guard (manual deep-tuning runs)."""
    if remaining is None:
        return True, "budget guard disabled (no remaining-budget info)"
    if estimate > remaining:
        return (
            False,
            f"estimated {estimate:,} tokens > {remaining:,} remaining — skipping {agent}",
        )
    return True, f"estimated {estimate:,} tokens ≤ {remaining:,} remaining"
