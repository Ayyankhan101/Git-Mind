"""Live end-to-end verification of the 7 DSPy agents against real Groq.

Runs the full LangGraph analysis pipeline on a small public repo, plus direct
calls for the agents the graph can't reach cheaply (solidity triage needs the
Rust sidecar; api_doc is exercised directly; pr_review and merge prediction
are separate routes). Every agent's output is asserted to be typed — the
Pydantic models from the DSPy programs are the contract.

Rate-limited calls are retried patiently (the on_demand token window refills
slowly), so this script can be re-run until the daily window clears. Results
from earlier successful runs short-circuit via the Redis/diskcache layer.

Usage:
    cd backend && venv/bin/python live_dspy_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

# ── Environment ────────────────────────────────────────────────────────────────
# load_dotenv must run before any dspy / langchain import (mirrors main.py)
from dotenv import load_dotenv

load_dotenv()

# Make the venv's tools (semgrep, etc.) findable when run via venv/bin/python
_venv_bin = Path(__file__).parent / "venv" / "bin"
if _venv_bin.exists():
    sys.path.insert(0, str(Path(__file__).parent))
    os.environ["PATH"] = f"{_venv_bin}:{os.environ.get('PATH', '')}"

REPO = "https://github.com/pallets/itsdangerous"
PR_URL = "https://github.com/zhanymkanov/fastapi-best-practices/pull/90"

OVERALL_DEADLINE = time.time() + 500  # stay inside the 600s tool timeout
results: list[dict] = []


def _budget_left() -> float:
    return OVERALL_DEADLINE - time.time()


def _patient_call(fn, *args, max_attempts: int = 4, **kwargs):
    """Call fn; on rate-limit, sleep until the window frees up and retry."""
    for attempt in range(1, max_attempts + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            msg = str(exc)
            is_rate = "RateLimit" in type(exc).__name__ or "rate_limit" in msg.lower()
            if not is_rate or attempt == max_attempts or _budget_left() < 60:
                if "tokens per day" in msg or "TPD" in msg:
                    print(
                        "   ⏳ daily token budget (TPD) exhausted — re-run after the "
                        "on-demand window refills (or a Dev Tier upgrade)"
                    )
                raise
            m = re.search(r"in (\d+)(?:m\s*)?(\d+)?\.?\d*s", msg)
            wait = (int(m.group(1)) * 60 + int(m.group(2) or 0)) if m else 60
            wait = min(max(wait, 30), 120)
            print(
                f"   ⏳ rate-limited (attempt {attempt}/{max_attempts}) — waiting {wait}s"
            )
            time.sleep(min(wait, _budget_left() - 10))


def record(name: str, status: str, detail: str) -> None:
    results.append({"agent": name, "status": status, "detail": detail})
    mark = {"live_ok": "✅", "fallback": "⚠️", "error": "❌"}.get(status, "·")
    print(f"{mark} {name}: {status} — {detail}")


# ── Agent verifications ────────────────────────────────────────────────────────


def verify_solidity():
    from agents.solidity_agent import _triage_with_llm

    contracts = json.dumps(
        [
            {
                "name": "Token",
                "functions": [
                    {
                        "name": "transfer",
                        "visibility": "public",
                        "parameters": [
                            {"name": "to", "type": "address"},
                            {"name": "amount", "type": "uint256"},
                        ],
                        "body": "balances[msg.sender] -= amount; balances[to] += amount;",
                        "modifiers": [],
                    }
                ],
                "state_variables": [
                    {"name": "balances", "type": "mapping(address => uint256)"}
                ],
                "modifiers": [
                    {"name": "onlyOwner", "body": "require(msg.sender == owner)"}
                ],
                "events": [{"name": "Transfer", "parameters": []}],
            }
        ]
    )

    def _run():
        return _triage_with_llm(json.loads(contracts))

    findings = _patient_call(_run)
    assert isinstance(findings, list)
    for f in findings:
        for k in (
            "id",
            "contract",
            "function",
            "severity",
            "title",
            "description",
            "remediation",
        ):
            assert (
                isinstance(f.get(k), str) and f[k]
            ), f"solidity finding missing {k}: {f}"
        assert f.get("swc") is None or isinstance(f.get("swc"), str)
    if not findings:
        record(
            "solidity", "live_ok", "triage ran live, 0 issues found (typed empty list)"
        )
    else:
        record(
            "solidity",
            "live_ok",
            f"{len(findings)} typed findings, e.g. [{findings[0]['severity']}] {findings[0]['title']}",
        )


def verify_api_doc():
    from agents.api_doc import run_api_doc_agent

    contents = {
        "app/main.py": (
            "from fastapi import FastAPI\n"
            "app = FastAPI()\n"
            "\n"
            "@app.get('/health')\n"
            "async def health():\n"
            "    return {'status': 'ok'}\n"
            "\n"
            "@app.post('/users')\n"
            "async def create_user(name: str):\n"
            "    return {'name': name}\n"
        )
    }

    def _run():
        return run_api_doc_agent(contents)

    endpoints = _patient_call(_run)
    assert isinstance(endpoints, list) and endpoints, "expected endpoints"
    for e in endpoints:
        assert isinstance(e.get("method"), str) and isinstance(e.get("route"), str)
        assert isinstance(e.get("description"), str) and isinstance(
            e.get("parameters"), str
        )
        assert e.get("auth_required") in (True, False, None)
    routes = ", ".join(f"{e['method']} {e['route']}" for e in endpoints)
    record("api_doc", "live_ok", f"{len(endpoints)} typed endpoints: {routes}")


def verify_language_audit():
    # Exercise the LLM-fallback path (what the graph uses when no linter is
    # installed) against real vulnerable source so the model has findings to give.
    from agents.language_audit import _PYTHON_PROMPT, _run_llm_fallback

    source = {
        "src/app.py": (
            "import subprocess\n"
            "import os\n"
            "\n"
            "def run(cmd):\n"
            "    subprocess.call(cmd, shell=True)\n"
            "\n"
            "def query(user_id):\n"
            "    conn.execute(f'SELECT * FROM users WHERE id = {user_id}')\n"
        )
    }

    def _run():
        return _run_llm_fallback(_PYTHON_PROMPT, ["src/app.py"], source, "python")

    findings = _patient_call(_run)
    assert isinstance(findings, list)
    for f in findings:
        assert isinstance(f["severity"], str) and isinstance(f["title"], str)
        assert f.get("line") is None or isinstance(f.get("line"), int)
        assert f.get("rule") is None or isinstance(f.get("rule"), str)
        assert f.get("cwe") is None or isinstance(f.get("cwe"), str)
    if findings:
        record(
            "language_audit",
            "live_ok",
            f"{len(findings)} typed findings, e.g. [{findings[0]['severity']}] {findings[0]['title']}",
        )
    else:
        record("language_audit", "live_ok", "ran live, 0 findings (typed empty list)")


def verify_pr_review():
    from agents.pr_review import run_pr_review

    def _run():
        return run_pr_review(PR_URL)

    result = _patient_call(_run)
    review = result["review"]
    assert review.startswith("## Summary") and "## Verdict" in review
    # The frontend's parseReview regex must be able to parse the issues
    issue_re = re.compile(
        r"^(.+?):(\d+)\s*[—–-]+\s*\[([A-Z]+)\]\s*(.+?)\s*[—–-]+\s*(.+)$"
    )
    parsed = sum(1 for line in review.splitlines() if issue_re.match(line.strip()))
    verdict = (
        "APPROVE"
        if "APPROVE" in review
        else "REQUEST CHANGES" if "REQUEST CHANGES" in review else "NEEDS DISCUSSION"
    )
    if "could not be generated" in review:
        record("pr_review", "fallback", "rate-limited — degraded review returned")
    else:
        record(
            "pr_review",
            "live_ok",
            f"verdict={verdict}, {parsed} frontend-parseable issues",
        )


def verify_impact():
    from agents.impact import run_merge_prediction
    from agents.pr_review import fetch_pr_data

    pr = _patient_call(fetch_pr_data, PR_URL)
    delta = {
        "base_score": 85,
        "pr_score": 88,
        "health_delta": 3,
        "base_grade": "B",
        "pr_grade": "A",
        "new_findings": [],
        "fixed_findings": [],
        "new_cves": [],
        "fixed_cves": [],
        "findings_delta": 0,
        "breakdown_delta": {
            "security": 5,
            "documentation": 0,
            "api_coverage": 2,
            "dependency_freshness": 0,
            "code_quality": 1,
        },
    }
    pr_meta = {
        "title": pr["title"],
        "owner": pr["owner"],
        "repo": pr["repo"],
        "pr_num": pr["pr_num"],
        "head_sha": pr["head_sha"],
        "base_branch": pr["base_branch"],
        "additions": pr["additions"],
        "deletions": pr["deletions"],
        "changed_files": pr["changed_files"],
        "diff_truncated": pr["diff_truncated"],
    }

    def _run():
        return run_merge_prediction(pr["diff"], delta, pr_meta)

    pred = _patient_call(_run)
    for k in ("merge_risk", "recommendation", "one_liner", "narrative", "confidence"):
        assert isinstance(pred.get(k), str) and pred[k], f"impact missing {k}"
    assert isinstance(pred["affected_areas"], list) and isinstance(
        pred["breaking_changes"], list
    )
    # run_merge_prediction degrades to a fallback dict on failure — flag it so the
    # report distinguishes fresh LLM output from the (also typed) fallback.
    if pred.get("narrative", "").startswith("Impact prediction could not be generated"):
        record("impact", "fallback", "rate-limited — typed fallback dict returned")
    else:
        record(
            "impact",
            "live_ok",
            f"risk={pred['merge_risk']} confidence={pred['confidence']}",
        )


async def verify_graph():
    """Full LangGraph pipeline on a small real repo."""
    from agents.health import compute_health
    from orchestrator import graph
    from services.session import initial_state

    final: dict = {}
    for attempt in range(1, 4):
        init = initial_state(REPO)
        final = dict(init)
        try:
            async for chunk in graph.astream(init, stream_mode="updates"):
                for _node, update in chunk.items():
                    for k, v in update.items():
                        if k != "events":
                            final[k] = v
            break
        except Exception as exc:
            msg = str(exc)
            is_rate = "RateLimit" in type(exc).__name__ or "rate_limit" in msg.lower()
            if not is_rate or attempt == 3:
                raise
            print(f"   ⏳ graph rate-limited (attempt {attempt}/3) — waiting 60s")
            await asyncio.sleep(60)
    try:
        arch = final.get("architecture_diagram")
        assert isinstance(arch, str) and arch.startswith("graph"), f"arch: {arch!r}"
        docs = final.get("api_docs") or []
        for e in docs:
            assert isinstance(e.get("method"), str) and isinstance(e.get("route"), str)
            assert e.get("auth_required") in (True, False, None)
        sec = final.get("security_findings") or []
        for f in sec:
            assert isinstance(
                f["line_start"], int
            ), f"line_start: {f.get('line_start')!r}"
            for k in (
                "id",
                "file",
                "severity",
                "title",
                "exploit_story",
                "remediation",
            ):
                assert isinstance(f.get(k), str) and f[k], f"finding missing {k}: {f}"
        ca = final.get("code_audit")
        for r in ca or []:
            for f in r.get("findings") or []:
                assert isinstance(f["severity"], str) and isinstance(f["title"], str)
                assert f.get("line") is None or isinstance(f.get("line"), int)
        health = compute_health(
            file_contents=final.get("file_contents", {}),
            security_findings=final.get("security_findings", []),
            cve_findings=final.get("cve_findings", []),
            api_docs=final.get("api_docs", []),
            code_audit=final.get("code_audit"),
        )
        # The agent nodes catch LLM failures internally and degrade — detect those
        # fallback markers so a rate-limited run isn't reported as live output.
        live_arch = "Analysis Incomplete" not in arch
        live_sec = bool(sec) and not any(f.get("id") == "demo01" for f in sec)
        if live_arch:
            langs = [r["language"] for r in ca or []]
            record(
                "architecture",
                "live_ok",
                f"diagram ok ({len(arch.splitlines())} lines, {len(docs)} endpoints, "
                f"{len(sec)} security findings, code_audit langs={langs}, health={health['grade']}{health['score']})",
            )
        else:
            record(
                "architecture",
                "fallback",
                "graph ran but LLM calls were rate-limited (fallback diagram)",
            )
        if not live_sec:
            record(
                "security",
                "fallback",
                "rate-limited — no/demo findings (semgrep triage)",
            )
    finally:
        lp = final.get("local_path")
        if lp:
            shutil.rmtree(lp, ignore_errors=True)


async def main() -> None:
    print(f"=== Live DSPy E2E — repo {REPO}, PR {PR_URL} ===\n")

    # Cheapest calls first — they fit the refilling token window sooner
    for fn in (verify_solidity, verify_api_doc, verify_language_audit):
        if _budget_left() < 120:
            print("⏹ overall budget exhausted, skipping remaining calls")
            break
        try:
            fn()
        except Exception as exc:
            record(
                fn.__name__.removeprefix("verify_"),
                "fallback",
                f"{type(exc).__name__}: {str(exc)[:120]}",
            )

    if _budget_left() > 180:
        try:
            verify_pr_review()
        except Exception as exc:
            record("pr_review", "fallback", f"{type(exc).__name__}: {str(exc)[:120]}")
    if _budget_left() > 180:
        try:
            verify_impact()
        except Exception as exc:
            record("impact", "fallback", f"{type(exc).__name__}: {str(exc)[:120]}")
    if _budget_left() > 240:
        try:
            await verify_graph()
        except Exception as exc:
            record(
                "architecture", "fallback", f"{type(exc).__name__}: {str(exc)[:120]}"
            )

    print("\n=== SUMMARY ===")
    print(json.dumps(results, indent=2))
    live = [r["agent"] for r in results if r["status"] == "live_ok"]
    print(
        f"\nLive-typed confirmed: {len(live)}/{len(results)} — {', '.join(live) or 'none'}"
    )


def verify_optimize(agent: str, min_gold: int | None = None) -> None:
    """Live MIPROv2 compile for ONE agent (opt-in — burns tokens, off-peak only).

    Harvests a tiny telemetry trainset, gates against the curated gold valset,
    and asserts any promoted program still loads and passes the typed contract.
    The budget guard is intentionally disabled — the caller chose to spend.

    ``min_gold`` caps the gold valset to its first N examples (the baseline
    eval costs ~650 tokens per example, so a tight Groq window can run with
    ``--min-gold 2`` and gate on a 2-example valset). Runs are refused when the
    curated gold set has fewer than N examples — the same floor semantics as
    ``optimization.run --min-gold``.
    """
    from unittest.mock import patch

    from dspy_setup import dspy
    from optimization import registry as opt_registry
    from optimization import run as opt_run
    from optimization.trainsets import harvest, load_gold

    opt_run._register_agents()  # like run.main — the registry needs the 7 agent modules

    valset = load_gold(agent)
    trainset = harvest(agent, limit=8)
    if not valset:
        record("optimize", "error", f"no gold valset for {agent}")
        return
    if not trainset:
        record(
            "optimize",
            "error",
            f"no telemetry trainset for {agent} (run the live agents first)",
        )
        return
    if min_gold is not None:
        if len(valset) < min_gold:
            record(
                "optimize",
                "error",
                f"gold valset too small ({len(valset)} < {min_gold}) — refusing to gate on it",
            )
            return
        valset = valset[:min_gold]
        print(
            f"   ℹ {agent}: gating on a {min_gold}-example gold valset (window-saving)"
        )
    try:
        out = opt_run.compile_agent(
            agent,
            trainset=trainset,
            valset=valset,
            remaining_budget=None,  # opt-in manual run — caller owns the budget
            auto="light",
            max_bootstrapped_demos=1,
            max_labeled_demos=1,
        )
    except Exception as exc:
        record("optimize", "fallback", f"{type(exc).__name__}: {str(exc)[:120]}")
        return
    if out is None:
        record("optimize", "live_ok", f"{agent}: gate rejected (no promotion)")
    else:
        # The promoted program must still load and emit typed output. We drive it
        # with a fake LM serving the first telemetry record's own output (known-
        # valid — harvest already validated it), so the contract check is
        # deterministic and spends no window.
        prog = opt_registry.load_program(agent)
        assert isinstance(prog, dspy.Module), "promoted program is not a dspy module"
        assert getattr(
            prog, "_opt_version", ""
        ), "promoted program lost its cache-key version stamp"
        from dspy import BaseLM as _BaseLM

        from llm_cache import run_dspy_cached as _run_cached
        from optimization.metrics import validate_output as _validate_output
        from optimization.registry import get_spec as _get_spec

        telemetry = harvest(agent, limit=1)[0]
        field = _get_spec(agent).output_field
        known_good = json.dumps({field: getattr(telemetry, field)}, default=str)

        class _FakeLM(_BaseLM):
            def __init__(self):
                super().__init__(
                    model="fake/promoted-check", model_type="chat", temperature=0.0
                )

            def __call__(self, *_args, **_kwargs):
                return [known_good]

        with (
            patch("llm_cache.get_cached", return_value=None),
            patch("llm_cache.set_cached"),
            patch("llm_cache._record_harvest"),
        ):
            payload = _run_cached(
                prog,
                f"optimize-e2e:{agent}",
                lm=_FakeLM(),
                output_field=field,
                **dict(telemetry.inputs()),
            )
        assert _validate_output(
            agent, payload
        ), f"promoted {agent} output failed the typed contract"
        record(
            "optimize", "live_ok", f"{agent} promoted -> {out} (typed output verified)"
        )


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Live DSPy E2E + opt-in MIPROv2 compile")
    ap.add_argument(
        "--optimize",
        metavar="AGENT",
        help="live MIPROv2 compile for one agent (off-peak only)",
    )
    ap.add_argument(
        "--min-gold",
        type=int,
        default=None,
        help="cap the gold valset to its first N examples (baseline costs ~650 tok/example — "
        "use a small N when the Groq daily window is tight)",
    )
    args = ap.parse_args()
    if args.optimize:
        verify_optimize(args.optimize, min_gold=args.min_gold)
    else:
        asyncio.run(main())
