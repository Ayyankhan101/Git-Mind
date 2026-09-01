"""Tests for the MIPROv2 self-optimization pipeline (backend/optimization/).

Covers the spec's test strategy: registry freshness + promoted→student
fallback, telemetry-harvest round-trip, gold-set validation (invalid entries
rejected, not silently included), structural metrics, cache-key version
scoping, and the compile → gate → promote flow with a mocked optimizer.
"""

import hashlib
import json
from unittest.mock import patch

import pytest
from dspy import BaseLM

# Import every agent so their programs are registered.
import agents.api_doc  # noqa: F401
import agents.architecture  # noqa: F401
import agents.impact  # noqa: F401
import agents.language_audit  # noqa: F401
import agents.pr_review  # noqa: F401
import agents.security  # noqa: F401
import agents.solidity_agent  # noqa: F401
from dspy_setup import dspy
from llm_cache import _dspy_key, _record_harvest, run_dspy_cached
from optimization import budget, metrics, registry, run, trainsets

ALL_AGENTS = registry.agent_names()

# ── Fake LM (mirrors test_dspy_programs) ─────────────────────────────────────


class FakeLM(BaseLM):
    def __init__(self, response: str):
        super().__init__(model="fake/test", model_type="chat", temperature=0.0)
        self.response = response
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return [self.response]


# ── Registry ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_build_program_returns_fresh_module(name):
    a = registry.build_program(name)
    b = registry.build_program(name)
    assert a is not b


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_load_program_returns_student_without_artifact(name, tmp_path):
    with (
        patch.object(registry, "OPT_DIR", tmp_path / "optimized"),
        patch.object(registry, "ACTIVE_FILE", tmp_path / "optimized" / "active.json"),
    ):
        prog = registry.load_program(name)
        assert isinstance(prog, dspy.Module)
        assert getattr(prog, "_agent", None) == name
        assert getattr(prog, "_opt_version", "") == ""  # student — no version


def test_load_program_falls_back_on_corrupt_artifact(tmp_path):
    opt = tmp_path / "optimized"
    bad = opt / "security-corrupt"
    bad.mkdir(parents=True)
    (bad / "program.pkl").write_bytes(b"not a pickle")
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        registry.promote("security", bad)
        prog = registry.load_program("security")
        assert isinstance(prog, dspy.Module)
        assert getattr(prog, "_opt_version", "") == ""  # student fallback


def test_promote_and_load_round_trip(tmp_path):
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        art = opt / "security-20260813-000000"
        registry.build_program("security").save(str(art), save_program=True)
        registry.promote("security", art)
        assert registry.active_artifact("security") == art

        loaded = registry.load_program("security")
        assert getattr(loaded, "_opt_version", "") != ""  # promoted program
        assert getattr(loaded, "_agent", None) == "security"


def test_rollback_restores_previous_artifact(tmp_path):
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        a = opt / "security-1"
        b = opt / "security-2"
        registry.build_program("security").save(str(a), save_program=True)
        registry.build_program("security").save(str(b), save_program=True)
        registry.promote("security", a)
        registry.promote("security", b)
        assert registry.active_artifact("security") == b
        assert registry.rollback("security") == a
        assert registry.active_artifact("security") == a


# ── Trainset harvest (telemetry log) ─────────────────────────────────────────


def test_harvest_round_trip(tmp_path):
    inputs = {
        "raw_findings": '[{"check_id": "x", "path": "a.py", "start": {"line": 1}, '
        '"end": {"line": 1}, "severity": "WARNING", "message": "m"}]'
    }
    output = [
        {
            "id": "x",
            "file": "a.py",
            "line_start": 1,
            "line_end": 1,
            "severity": "medium",
            "title": "T",
            "exploit_story": "E",
            "remediation": "R",
            "cwe": "CWE-1",
        }
    ]
    with patch("llm_cache._HARVEST_DIR", tmp_path / ".dspy_harvest"):
        _record_harvest("security", "SecurityTriage", inputs, output)
        exs = trainsets.harvest("security")
    assert len(exs) == 1
    ex = exs[0]
    assert ex.raw_findings == inputs["raw_findings"]
    assert ex.findings == output
    assert set(ex.inputs()) == {"raw_findings"}


def test_harvest_dedupes_same_inputs(tmp_path):
    inputs = {"raw_findings": "[]"}
    with patch("llm_cache._HARVEST_DIR", tmp_path / ".dspy_harvest"):
        for _ in range(3):
            _record_harvest("security", "SecurityTriage", inputs, [])
        exs = trainsets.harvest("security")
    assert len(exs) == 1


def test_harvest_rejects_invalid_output(tmp_path):
    with patch("llm_cache._HARVEST_DIR", tmp_path / ".dspy_harvest"):
        _record_harvest("security", "SecurityTriage", {"raw_findings": "[]"}, {"bad": 1})
        exs = trainsets.harvest("security")
    assert exs == []


# ── Gold sets ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_gold_sets_all_validate(name):
    """Every curated gold example must pass the agent's structural validation."""
    exs = trainsets.load_gold(name)
    assert exs, f"gold set for {name} is empty"
    field = registry.get_spec(name).output_field
    for ex in exs:
        assert metrics.validate_output(name, getattr(ex, field)), name


def test_load_gold_rejects_invalid_entry(tmp_path):
    with patch.object(trainsets, "GOLD_DIR", tmp_path):
        (tmp_path / "security.json").write_text(
            json.dumps([{"inputs": {"raw_findings": "[]"}, "output": [{"id": "x"}]}])
        )
        assert trainsets.load_gold("security") == []


# ── Metrics ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_validate_output_rejects_malformed(name):
    for bad in ("garbage", None, {}, 42):
        assert not metrics.validate_output(name, bad), name


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_metric_scores_gold_copy_high(name):
    metric = metrics.make_metric(name)
    field = registry.get_spec(name).output_field
    for ex in trainsets.load_gold(name):
        out = getattr(ex, field)
        # Plain payload and full-output dict shapes must both score ~1.0.
        assert metric(ex, out) >= 0.9, (name, "plain")
        assert metric(ex, {field: out}) >= 0.9, (name, "wrapped")


@pytest.mark.parametrize("name", ALL_AGENTS)
def test_metric_rejects_garbage(name):
    metric = metrics.make_metric(name)
    gold = trainsets.load_gold(name)
    assert gold
    assert metric(gold[0], "garbage") == 0.0


# ── Cache-key versioning ─────────────────────────────────────────────────────


def test_dspy_key_version_scoping():
    base = _dspy_key("SecurityTriage", {"raw_findings": "x"})
    assert _dspy_key("SecurityTriage", {"raw_findings": "x"}) == base  # stable
    assert _dspy_key("SecurityTriage", {"raw_findings": "x"}, version="v2") != base


def test_dspy_key_student_matches_pre_optimization_format():
    """Students (no version) must keep the exact pre-optimization key, so the
    existing production cache entries still hit after this change ships."""
    legacy = hashlib.sha256(b'SecurityTriage::{"raw_findings": "x"}').hexdigest()
    assert _dspy_key("SecurityTriage", {"raw_findings": "x"}) == legacy


def test_run_dspy_cached_version_bump_changes_key():
    seen: list[str] = []

    def fake_get(namespace, key):
        seen.append(key)
        return None

    with (
        patch("llm_cache.get_cached", side_effect=fake_get),
        patch("llm_cache.set_cached"),
        patch("llm_cache._record_harvest"),
    ):
        prog = registry.build_program("security")
        run_dspy_cached(
            prog,
            "ns",
            lm=FakeLM('{"findings": []}'),
            output_field="findings",
            raw_findings="[]",
        )
        prog2 = registry.build_program("security")
        prog2._opt_version = "v2"
        run_dspy_cached(
            prog2,
            "ns",
            lm=FakeLM('{"findings": []}'),
            output_field="findings",
            raw_findings="[]",
        )
    assert len(seen) == 2
    assert seen[0] != seen[1]


# ── Budget guard ─────────────────────────────────────────────────────────────


def test_estimate_scales_with_trainset():
    assert budget.estimate_compile_tokens(100) > budget.estimate_compile_tokens(10)
    assert budget.estimate_compile_tokens(10, auto="heavy") > budget.estimate_compile_tokens(10, auto="light")


def test_guard_aborts_over_budget():
    ok, reason = budget.guard_budget("security", 1_000_000, remaining=100_000)
    assert not ok
    assert "skipping" in reason
    ok2, _ = budget.guard_budget("security", 50_000, remaining=100_000)
    assert ok2


# ── CLI flag wiring ──────────────────────────────────────────────────────────


def test_cli_demos_zero_disables_demos():
    """--demos 0 must mean *zero* demos (zeroshot smoke), not the default 4.
    `0 or DEFAULT` would silently re-enable demos — the spec's cheapest-live-
    smoke flag must actually skip bootstrap."""
    seen: dict = {}

    def fake_compile_agent(agent, **kwargs):
        seen["kwargs"] = kwargs
        return None

    with (
        patch("optimization.run._register_agents"),
        patch(
            "optimization.run.harvest",
            return_value=[dspy.Example(raw_findings="[]", findings=[]).with_inputs("raw_findings")],
        ),
        patch("optimization.run.load_gold", return_value=trainsets.load_gold("security")),
        patch("optimization.run.compile_agent", side_effect=fake_compile_agent),
    ):
        run.main(["--agent", "security", "--demos", "0", "--auto", "none"])
    assert seen["kwargs"]["max_bootstrapped_demos"] == 0
    assert seen["kwargs"]["max_labeled_demos"] == 0


def test_cli_demos_unset_uses_default():
    seen: dict = {}

    def fake_compile_agent(agent, **kwargs):
        seen["kwargs"] = kwargs
        return None

    with (
        patch("optimization.run._register_agents"),
        patch(
            "optimization.run.harvest",
            return_value=[dspy.Example(raw_findings="[]", findings=[]).with_inputs("raw_findings")],
        ),
        patch("optimization.run.load_gold", return_value=trainsets.load_gold("security")),
        patch("optimization.run.compile_agent", side_effect=fake_compile_agent),
    ):
        run.main(["--agent", "security"])  # no --demos
    assert seen["kwargs"]["max_bootstrapped_demos"] == run.DEFAULT_MAX_BOOTSTRAPPED_DEMOS


def test_cli_rollback_restores_previous_artifact(tmp_path):
    """--rollback <agent> reverts active.json to the previous artifact."""
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
        patch("optimization.run._register_agents"),
    ):
        a = opt / "security-1"
        b = opt / "security-2"
        registry.build_program("security").save(str(a), save_program=True)
        registry.build_program("security").save(str(b), save_program=True)
        registry.promote("security", a)
        registry.promote("security", b)
        assert registry.active_artifact("security") == b

        rc = run.main(["--rollback", "security"])
        assert rc == 0
        assert registry.active_artifact("security") == a


def test_cli_rollback_no_history_reports_failure(tmp_path):
    """--rollback with nothing in history must exit non-zero (nothing reverted)."""
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
        patch("optimization.run._register_agents"),
    ):
        rc = run.main(["--rollback", "security"])
        assert rc == 1
        assert registry.active_artifact("security") is None


def test_promoted_program_passes_typed_contract(tmp_path):
    """Mirror live_dspy_e2e.verify_optimize's post-promotion check: a promoted
    program must load with its version stamp and, driven by a fake LM serving a
    known-good output, still pass the agent's structural validation."""
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        art = opt / "security-20260813-120000"
        registry.build_program("security").save(str(art), save_program=True)
        registry.promote("security", art)
        prog = registry.load_program("security")

        assert isinstance(prog, dspy.Module)
        assert getattr(prog, "_opt_version", ""), "promoted program lost its cache-key version stamp"

        gold = trainsets.load_gold("security")[0]
        field = registry.get_spec("security").output_field
        known_good = json.dumps({field: getattr(gold, field)}, default=str)

        class FakePromoLM(FakeLM):
            def __init__(self):
                super().__init__(response="")

            def __call__(self, *args, **kwargs):
                self.calls += 1
                return [known_good]

        with (
            patch("llm_cache.get_cached", return_value=None),
            patch("llm_cache.set_cached"),
            patch("llm_cache._record_harvest"),
        ):
            payload = run_dspy_cached(
                prog,
                "optimize-e2e:security",
                lm=FakePromoLM(),
                output_field=field,
                **dict(gold.inputs()),
            )
        assert metrics.validate_output("security", payload), "promoted output failed the typed contract"


def test_verify_optimize_min_gold_caps_valset(tmp_path):
    """live_dspy_e2e.verify_optimize(agent, min_gold=N) must hand compile_agent
    a valset capped to the first N gold examples (window-saving baseline)."""
    import live_dspy_e2e as e2e

    gold = trainsets.load_gold("security")
    assert len(gold) >= 5
    seen: dict = {}

    def fake_compile(agent, **kwargs):
        seen["valset"] = kwargs.get("valset")
        return None

    with (
        patch.object(e2e, "record"),
        patch("optimization.trainsets.harvest", return_value=[object()]),
        patch("optimization.run.compile_agent", side_effect=fake_compile),
    ):
        e2e.verify_optimize("security", min_gold=2)
    assert len(seen["valset"]) == 2
    assert seen["valset"][0] == gold[0]
    assert seen["valset"][1] == gold[1]


def test_verify_optimize_min_gold_refuses_when_gold_small(tmp_path):
    """min_gold larger than the curated gold set must refuse to run (floor)."""
    import live_dspy_e2e as e2e

    with patch.object(e2e, "record") as rec:
        e2e.verify_optimize("security", min_gold=10_000)
    assert rec.call_count == 1
    assert rec.call_args.args[1] == "error"


# ── Compile → gate → promote ─────────────────────────────────────────────────


def test_should_promote_margin():
    assert run._should_promote(0.5, 0.55)
    assert not run._should_promote(0.5, 0.54)
    assert run._should_promote(0.5, 0.9)


class FakeEvaluator:
    """dspy.Evaluate replacement — pops a controlled score per call."""

    def __init__(self, scores):
        self.scores = list(scores)

    def __call__(self, program, devset=None):
        return self.scores.pop(0) if self.scores else 0.0


class FakeMIPROv2:
    """dspy.MIPROv2 replacement — returns the student untouched (no LM calls)."""

    def __init__(self, *args, **kwargs):
        pass

    def compile(self, student, **kwargs):
        return student  # a real Predict — save/load round-trips


def _security_trainset():
    return [dspy.Example(raw_findings="[]", findings=[]).with_inputs("raw_findings")]


def test_compile_agent_rejects_below_baseline(tmp_path):
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        evaluator = FakeEvaluator([0.8, 0.79])  # baseline, optimized score
        with (
            patch("optimization.run.dspy.Evaluate", lambda **_: evaluator),
            patch("optimization.run.dspy.MIPROv2", FakeMIPROv2),
        ):
            out = run.compile_agent(
                "security",
                trainset=_security_trainset(),
                valset=trainsets.load_gold("security"),
            )
    assert out is None
    assert not (opt / "active.json").exists()  # active program untouched


def test_compile_agent_promotes_above_baseline(tmp_path):
    opt = tmp_path / "optimized"
    with (
        patch.object(registry, "OPT_DIR", opt),
        patch.object(registry, "ACTIVE_FILE", opt / "active.json"),
    ):
        evaluator = FakeEvaluator([0.4, 0.95])
        with (
            patch("optimization.run.dspy.Evaluate", lambda **_: evaluator),
            patch("optimization.run.dspy.MIPROv2", FakeMIPROv2),
        ):
            out = run.compile_agent(
                "security",
                trainset=_security_trainset(),
                valset=trainsets.load_gold("security"),
            )
        assert out is not None and out.is_dir()
        assert (out / "program.pkl").exists()
        active = json.loads((opt / "active.json").read_text())
        assert active["security"] == str(out)
        # The promoted program loads and is versioned (cache keys scoped).
        loaded = registry.load_program("security")
        assert getattr(loaded, "_opt_version", "") != ""
