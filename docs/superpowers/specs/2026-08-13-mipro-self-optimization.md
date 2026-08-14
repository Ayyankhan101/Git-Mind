# MIPROv2 Self-Optimization Pipeline

**Date:** 2026-08-13
**Status:** Implemented — corrections from live verification applied

## Problem

The 7 structured-output agents now run as typed DSPy programs (`dspy.Predict` /
`ChainOfThought` bound to Pydantic output models). Their prompt quality is
frozen at authoring time — instruction phrasing and demo selection are static.
The whole point of the DSPy seam (Approach A) was that self-optimization
(MIPROv2) becomes available later **without rework**. This spec sketches that
pipeline: periodically re-optimize each program's instructions and few-shot
demos against real collected data, then hot-swap the improved program in —
with zero change to `run_*(...)` signatures, the orchestrator, routes, or the
frontend contract.

## Verified API surface (dspy 3.3.0)

Probed against the installed version, not docs:

```python
dspy.MIPROv2(
    metric,                    # required: metric(gold, pred, trace) -> float
    prompt_model=None,         # LM that proposes instructions
    task_model=None,           # LM that executes candidates during search
    max_bootstrapped_demos=4,  # few-shot demos mined from the trainset
    max_labeled_demos=4,       # labeled examples used directly
    auto="light",              # "light" | "medium" | "heavy" | None
    num_candidates=None,       # only when auto=None (auto overrides it)
    num_threads=None,
    max_errors=None,
    seed=9,
    init_temperature=1.0,
    verbose=False,
    track_stats=True,
    log_dir=None,
)
optimized = tp.compile(
    student,                   # the unoptimized dspy.Predict/ChainOfThought
    trainset=[...],            # list[dspy.Example] with inputs + labels
    valset=[...] | None,       # held-out set for scoring during search
    num_trials=None,           # only when auto=None — on compile(), NOT the constructor
    minibatch_size=len(valset),  # default 35 exceeds small gold sets
    requires_permission_to_run=False,  # deprecated — omit in new code
)
optimized.save(str(dir_path), save_program=True)  # DIRECTORY, no .json suffix
program = dspy.load(str(dir_path), allow_pickle=True)  # allow_pickle required
score = dspy.Evaluate(metric=..., devset=valset)(optimized)  # devset is a REQUIRED constructor kwarg
```

Constraints discovered while probing the installed dspy 3.3.0:

- **`auto` overrides `num_candidates`/`num_trials`** — passing both raises.
  Use `auto="light"` for cadence runs, `auto=None` + explicit
  `num_candidates`/`num_trials` for deep tuning (`num_trials` is a `compile`
  kwarg, not a constructor kwarg).
- **`prompt_model` + `task_model` or a configured default LM is mandatory.**
  Our `settings.get_dspy_lm()` factory satisfies this: pass it as
  `task_model`, and a stronger/heavier model as `prompt_model` when available.
- **`Module.save(path, save_program=True)` requires a directory path** — a
  `.json` suffix raises `ValueError`. The directory holds `metadata.json` +
  `program.pkl` (cloudpickle), and `dspy.load(path)` refuses pickle unless
  `allow_pickle=True` (fine — artifacts are self-produced by the compile
  process). State-only JSON (`module.save("x.json")`) round-trips too, but
  `Module.load` needs a matching structure, which compiled programs don't
  guarantee.
- **`dspy.Evaluate` takes `devset` in the constructor** (`Evaluate(metric=...,
  devset=...)`), then `evaluator(program)`. Passing `devset` only to
  `__call__` raises `TypeError`.
- **MIPROv2 search requires `optuna`** — add `optuna` to `requirements.txt`
  (not pulled in by plain `dspy==3.3.0`).
- **`minibatch_size` defaults to 35** — a valset smaller than that must pass
  `minibatch_size=len(valset)` explicitly.
- **`compile` consumes a large token budget.** A real `auto="light"` compile
  bootstraps demos, proposes ~dozens of instruction candidates, and scores each
  on the trainset — easily thousands of tokens per agent. Live probe on the
  on-demand tier: `auto="light"` = 6 candidates and ~20+ trials; a minimal
  `auto=None, num_candidates=1, num_trials=1, max_*_demos=0` run still needs
  ~3–4K tokens (baseline + proposal + default-eval + trial + gate). The Groq
  on-demand cap (100K TPD) refills at only ~70–150 tokens/min once exhausted,
  so a full compile must run **off-peak with the budget guard fed the real
  remaining window** (`--budget` or `GROQ_DAILY_REMAINING`). See
  [Token budget](#token-budget).

## Live verification (2026-08-13, dspy 3.3.0)

- `python -m optimization.run` runs standalone after `load_dotenv()` in
  `main()` (nothing else imports the agents, so `_register_agents()` runs
  first; `dotenv` is loaded because a bare CLI has no `GROQ_API_KEY`).
- A minimal live run (`--auto none --candidates 1 --trials 1 --demos 0`)
  executes correctly end-to-end: budget guard → baseline (`Evaluate` on the
  gold valset) → MIPROv2 bootstrap (skipped with `--demos 0`) → data-summary
  proposal (degrades gracefully when rate-limited: "Running without data aware
  proposer") → instruction proposal. It stops only at the TPD cap.
- **Clean CLI runs have no global LM — `Evaluate` must run inside
  `dspy.context(lm=...)`.** First live attempt crashed at the baseline step:
  `dspy.Evaluate` executes the *program*, which calls the LM, and a bare
  `python -m optimization.run` (unlike a session that has called
  `dspy.configure`/`get_dspy_lm` before) has no LM configured — every valset
  example failed with "No LM is loaded". Fix (live-verified): `compile_agent`
  evaluates baseline and final score via `_evaluate_in_context(lm, ...)`, a
  thin wrapper that runs `Evaluate` inside `dspy.context(lm=lm)`; the mocked
  gate tests didn't catch this because they replace `dspy.Evaluate` entirely.
- **`live_dspy_e2e.py --optimize <agent>` must register the agents itself.**
  `verify_optimize` calls `load_gold`/`harvest`/`compile_agent` directly and
  bypassed `run.main()` — which is the only place `_register_agents()` runs —
  so the registry was empty (`KeyError: no program registered`). Fix
  (live-verified): `verify_optimize` calls `opt_run._register_agents()` first.
  After that the run progressed budget guard → baseline eval → real TPD cap
  (99,580/100,000, ~650 tokens per valset example) and degraded to the
  recorded `fallback` — the 12-example baseline alone needs ~8K tokens, so a
  live promotion can only complete off-peak with a refilled window.
- The baseline scored `0.000` on the curated gold valset — expected: the
  student's free-form titles/severities rarely equal the gold rubric tuples
  exactly. That is the number the gate requires the optimized program to beat.
- Telemetry → trainset works live: 4 small real security-triage calls produced
  `.dspy_harvest/security.jsonl`, and `harvest("security")` returned 4
  validated `dspy.Example`s. The gold sets were later expanded to 10–12
  verified examples per agent (`optimization/gold/`, all passing Pydantic
  validation).

## Architecture

### 1. Program registry — the only refactor to the 7 agents

Today each agent owns a module-level `_predictor = dspy.Predict(Sig)` and a
hardcoded `_CACHE_NAMESPACE`. To make programs swappable without touching the
agents' logic, route construction through a tiny registry:

```python
# backend/optimization/registry.py (implemented)
def define_program(name, signature, *, output_field, input_fields,
                   output_model=None, cot=False) -> dspy.Module:
    # registers a factory that builds a fresh student AND returns the program
    # to use at runtime (promoted if active, else student). This is the
    # one-line agent hook.
def build_program(name) -> dspy.Module:   # fresh, unoptimized "student"
def load_program(name) -> dspy.Module:     # optimized if active, else student
```

Each agent changes exactly one line — `_predictor = dspy.Predict(SecurityTriage)`
becomes `_predictor = define_program("security", SecurityTriage, ...)`. The
registry resolves:
1. a **promoted** program from `optimized/active.json` (see
   [Promotion](#promotion)), else
2. a freshly built **student**.

`define_program` also captures the output model + field (for metrics and gold
validation) and whether the output field is a list. `build_program` must return
a *new* module each call: MIPROv2 `compile` may mutate/replace the passed
student, so the registered factory (not a module-level singleton) is the source
of truth for a pristine student. Promoted programs are stamped with
`_opt_version` (hash of the artifact) and `_agent` (harvest-log name).

### 2. Trainsets — two sources, one `dspy.Example` shape

**Source A — the telemetry log (free weak labels).** The cache keys are
SHA-256 hashes of `(sig, inputs)`, so the inputs are **unrecoverable from the
cache itself** — a harvest step that "replays the cache" cannot reconstruct
`dspy.Example`s. Fix: `run_dspy_cached` appends one JSONL record per real LLM
call (cache miss only) to `.dspy_harvest/<agent>.jsonl`
(`{sig, inputs, output}`, gitignored, size-capped). `harvest()` replays that
log into `dspy.Example(**inputs, **{output_field: output})
.with_inputs(*input_fields)` — same shape the program already accepts, so no
new labeling effort. Records with invalid outputs are skipped; same-input
records are deduped. These are *model-generated* labels, so they power
bootstrapping (`max_bootstrapped_demos`) more than grading.

**Source B — curated gold examples.** A hand-checked set per agent (now 10–12
examples, `optimization/gold/<agent>.json`) used as `valset` for scoring. These
are the ground truth that decides promotion, so they must be verified against
the same Pydantic output models (any example that fails `model_validate` is
rejected at load, never silently included).

Note on `language_audit`: it shares one signature across tool-triage and LLM
fallback. Both call sites pool into one corpus — fine, because the signature's
`guidance` + `context` inputs naturally separate the two behaviors, and the
cache key already includes them.

### 3. Metrics — per agent

`metric(gold, pred, trace)` returns a float in [0, 1]. Structural checks
(required keys, types, severity ∈ allowed set) are exact; semantic checks use
gold-set rubric fields. Sketch:

| Agent | Metric |
| --- | --- |
| security / solidity / language_audit | structural validity of every finding + fraction of gold findings matched on (severity, title, location-key: file/line_start, contract/function, file/line) |
| api_doc | structural validity + route/method match against gold endpoints |
| impact | structural validity + `merge_risk` agreement (0.5) + `confidence` agreement (0.25) + affected-areas overlap (0.25) |
| pr_review | structural validity (verdict ∈ allowed set) + verdict match (0.7) + gold issue (file, line) overlap (0.3) — the markdown is rendered from the typed review, so frontend parsing follows automatically |
| architecture | output is a `graph `-prefixed Mermaid string + node-name (id) overlap with gold diagram |

Structural validity is a shared helper (`validate_output(agent, pred)`) that
just runs the program's Pydantic output model — the same validation the agents
already rely on, so the metric can never reward malformed output.

### 4. Compile pipeline

```python
# backend/optimization/run.py  — one agent per invocation (implemented)
def compile_agent(agent, *, trainset, valset, remaining_budget=None,
                  auto="light", margin=0.05, num_candidates=None,
                  num_trials=None, avg_input_tokens=2000) -> Path | None:
    estimate = estimate_compile_tokens(len(trainset), auto=auto,
                                       avg_input_tokens=avg_input_tokens)
    ok, reason = guard_budget(agent, estimate, remaining_budget)  # abort early
    if not ok: return None
    metric = make_metric(agent)
    lm = get_dspy_lm(temperature_key=AGENT_TEMP_KEYS[agent])
    baseline = _evaluate_in_context(lm, registry.load_program(agent), valset, metric)  # current
    student = registry.build_program(agent)  # fresh — compile may mutate it
    with dspy.context(lm=lm):
        tp = dspy.MIPROv2(metric=metric, task_model=lm, prompt_model=lm,
                          auto=auto, max_bootstrapped_demos=...,
                          max_labeled_demos=..., seed=9,
                          num_candidates=num_candidates)  # only when auto=None
        optimized = tp.compile(student, trainset=trainset, valset=valset,
                               minibatch_size=min(len(valset), 35),
                               num_trials=num_trials)  # num_trials only when auto=None
    score = _evaluate_in_context(lm, optimized, valset, metric)
    if score < baseline + margin: return None  # gate — never promote on churn
    out = registry.OPT_DIR / f"{agent}-{timestamp}"   # DIRECTORY, no .json
    optimized.save(str(out), save_program=True)
    registry.promote(agent, out)
    return out
```

- **Baseline** = `dspy.Evaluate(metric=..., devset=valset)(current)` — `devset`
  is a required **constructor** kwarg. Only promote on measured improvement
  (`score ≥ baseline + margin`), never on churn.
- **Deterministic gate:** `seed=9` default is kept; trainset sampling is seeded
  so re-runs are comparable.
- **Valset reuse:** `compile`'s `valset` and the final `Evaluate` use the same
  held-out set — acceptable for a sketch; a production build should split
  valset/devset.
- CLI flags: `--agent <name>` (compile) vs `--rollback <name>` (revert to the
  previous promoted artifact — mutually exclusive; rollback exits before any
  harvest/compile work and returns non-zero when there is no history),
  `--auto none --candidates N --trials N` (deep tuning),
  `--demos N` (`0` = zeroshot, skips bootstrap — cheapest live smoke),
  `--avg-input-tokens N` (calibrate the estimate; the 2,000 default
  overestimates small-input agents ~10×), `--budget N` / `GROQ_DAILY_REMAINING`
  (the real remaining window — the guard is only as good as this input).

### 5. Promotion — a versioned artifact, not an overwrite

Promoted programs are written to `backend/optimized/<agent>-<ts>/` (gitignored
**directories** — `Module.save(path, save_program=True)` refuses a `.json`
suffix; the dir holds `metadata.json` + `program.pkl`). The active version is
recorded in a small `optimized/active.json` (file-based so promotion works
without Redis), with the last 3 previous artifacts kept under `_rollback`.
`load_program` reads the active version via
`dspy.load(path, allow_pickle=True)` and falls back to the student if
missing/corrupt (artifacts are self-produced, so pickle is trusted).

### 6. Cache-key interaction — the trap to design around

`run_dspy_cached` currently keys on **signature name + serialized inputs**
(`_dspy_key(sig_name, inputs)`). MIPROv2 changes the signature's *instructions
and demos* but not its class name — so a promoted program would keep hitting
stale, pre-optimization cache entries and the optimization would never take
effect in production. Two options:

- **Implemented:** `load_program` stamps `_opt_version` (sha-256 of the
  artifact's `program.pkl`, truncated) onto promoted programs, and
  `run_dspy_cached` folds it into the key:
  `_dspy_key(sig_name, inputs, version=getattr(program, "_opt_version", ""))`.
  **Backward compat is preserved:** students (no version) produce the byte-
  identical legacy key, so existing production cache entries still hit; a
  promoted program's keys are version-scoped, so old entries expire via TTL
  while new prompts get fresh keys (locked in by a test).
- **Rejected alternative:** bumping `_CACHE_NAMESPACE` on promotion — simpler,
  but orphans all historical cache entries at once.

Either way, the cache stays the single layer (DSPy's internal `cache=False`
remains), and identical calls still short-circuit — just under version-scoped
keys.

### 7. Token budget

Live probing showed the on-demand daily cap is real and binds fast. Guardrails:

- **One agent per run**, invoked off-peak (a `CronTrigger`-style schedule or a
  manual `python -m optimization.run --agent security`).
- **Budget estimator before compile:** estimate from `len(trainset) ×
  max_bootstrapped_demos × candidates(auto) × avg_tokens`; abort if it exceeds
  the remaining daily window. The estimate is only as good as the inputs:
  pass the agent's real input size via `--avg-input-tokens` (default 2,000
  overestimates small-input agents ~10×) and the real window via `--budget` or
  `GROQ_DAILY_REMAINING`. A guard fed a wrong `remaining` cannot save you —
  ops must know the window.
- **`auto="light"`** for cadence; escalate to `"medium"`/explicit trials
  (`--auto none --candidates N --trials N`) only for specific agents under
  manual supervision. `--demos 0` runs zeroshot optimization (no bootstrap
  demos) — the cheapest live smoke.
- `prompt_model` (instruction proposal) can be the same model; a larger model
  improves proposal quality but burns budget — keep it configurable.

## File layout

```
backend/optimization/
  registry.py    # define_program / build_program / load_program / promote
  metrics.py     # make_metric(agent) + shared structural validator
  trainsets.py   # harvest() from .dspy_harvest log + gold-set loader
  budget.py      # token estimator + daily-window guard
  run.py         # compile_agent() + CLI entry (python -m optimization.run)
  gold/          # curated valsets: <agent>.json (10–12 examples each)
backend/.dspy_harvest/   # gitignored live-call telemetry (JSONL, one file/agent)
backend/optimized/       # gitignored promoted artifacts (dirs + active.json)
backend/agents/*.py      # one-line change each: use define_program()
```

## Test strategy

- **Registry:** `build_program` returns a fresh module per call; `load_program`
  resolves promoted → student fallback on corrupt/missing artifact.
- **Trainset harvest:** cache JSON → `dspy.Example` round-trip; gold examples
  that fail Pydantic validation are rejected, not silently included.
- **Metrics:** structural metric rejects malformed preds (reuses existing
  validation logic); each agent's metric scores a known-good pair 1.0.
- **Cache versioning:** same inputs + same program → cache hit; same inputs +
  bumped version → cache miss (mirrors `test_dspy_programs.py` style).
- **Gate:** a compile that scores below baseline returns `None` and leaves the
  active program untouched.
- **Integration (opt-in, live):** `live_dspy_e2e.py --optimize <agent>`
  (already wired via `verify_optimize`) compiles one agent against a tiny
  trainset and asserts the promoted program still passes the typed-output
  contract.

## Deployment

- **One new dep:** `optuna` added to `requirements.txt` — MIPROv2's search
  phase requires it (plain `dspy==3.3.0` does not pull it in). Everything else
  was already present.
- Promotion artifacts ship as part of the backend image or are pulled from
  Redis at startup; `load_program` must degrade to the student if artifacts are
  absent (fresh deploy, no Redis).
- Scheduled optimization runs are opt-in infra (CI cron or a worker), never
  part of the request path — the runtime path stays exactly as it is today.
