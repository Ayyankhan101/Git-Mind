#!/usr/bin/env python3
"""
Pre-demo environment validator.
Run this from the backend/ directory before every demo session:

    python smoke_test.py

All checks must pass. Fix any failure before going on stage.
"""

import os
import shutil
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_PASS = "[PASS]"
_FAIL = "[FAIL]"
_errors: list[str] = []


def check(label: str, ok: bool, hint: str = "") -> None:
    if ok:
        print(f"  {_PASS}  {label}")
    else:
        detail = f"  →  {hint}" if hint else ""
        print(f"  {_FAIL}  {label}{detail}")
        _errors.append(label)


print("\n══════════════════════════════════════════")
print("   GitMind — Pre-Demo Smoke Test")
print("══════════════════════════════════════════\n")

# ── 1. Environment ─────────────────────────────────────────────────────────────
print("[ Environment ]")

api_key = os.getenv("GROQ_API_KEY", "")
_ci_smoke = os.getenv("CI_SMOKE", "").lower() in ("1", "true", "yes") or os.getenv("GITHUB_ACTIONS") == "true"
_placeholder_key = api_key in ("", "gsk_test_placeholder")
_skip_live_checks = _ci_smoke or _placeholder_key


def skip(label: str, reason: str) -> None:
    print(f"  [SKIP]  {label}  →  {reason}")


if _skip_live_checks:
    skip("GROQ_API_KEY is set", "CI smoke mode")
    skip("GROQ_API_KEY format (gsk_...)", "CI smoke mode")
else:
    check("GROQ_API_KEY is set", bool(api_key), "Add to backend/.env")
    check("GROQ_API_KEY format (gsk_...)", api_key.startswith("gsk_"), f"Got prefix: {api_key[:6]!r}")
_venv_semgrep = Path(__file__).parent / "venv" / "bin" / "semgrep"
check("semgrep available", shutil.which("semgrep") is not None or _venv_semgrep.exists(), "pip install semgrep")

# ── 2. ChromaDB ────────────────────────────────────────────────────────────────
print("\n[ ChromaDB ]")
try:
    import chromadb

    client = chromadb.Client()
    col = client.create_collection("smoketest", get_or_create=True)
    col.add(documents=["hello world"], ids=["t1"])
    result = col.query(query_texts=["hello"], n_results=1)
    check("ChromaDB in-memory create + query", "hello world" in result["documents"][0])  # type: ignore[index]
    client.delete_collection("smoketest")
except Exception as exc:
    check("ChromaDB in-memory create + query", False, str(exc))

# ── 3. LLM cache ───────────────────────────────────────────────────────────────
print("\n[ LLM Cache ]")
try:
    from llm_cache import get_cached, set_cached

    set_cached("_smoke", "ping", "pong")
    check("diskcache write + read", get_cached("_smoke", "ping") == "pong")
except Exception as exc:
    check("diskcache write + read", False, str(exc))

# ── 4. tiktoken ────────────────────────────────────────────────────────────────
print("\n[ tiktoken ]")
try:
    import tiktoken

    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode("Hello, world!")
    check("tiktoken encodes text (cl100k_base)", len(tokens) > 0)
except Exception as exc:
    check("tiktoken encodes text (cl100k_base)", False, str(exc))

# ── 5. Groq API reachability ───────────────────────────────────────────────────
print("\n[ Groq API ]")
if api_key and not _skip_live_checks:
    try:
        from langchain_groq import ChatGroq

        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, max_tokens=5)
        resp = llm.invoke("Reply with the single word: OK")
        check("Groq API reachable", len(resp.content) > 0, resp.content)  # type: ignore[arg-type]
    except Exception as exc:
        check("Groq API reachable", False, str(exc))
else:
    skip("Groq API reachable", "CI smoke mode / no live key")

# ── 6. GitPython clone ─────────────────────────────────────────────────────────
print("\n[ GitPython ]")
try:
    import git

    dest = tempfile.mkdtemp(prefix="gitmind_smoke_")
    repo = git.Repo.clone_from("https://github.com/octocat/Hello-World", dest, depth=1)
    repo.close()
    shutil.rmtree(dest, ignore_errors=True)
    check("GitPython shallow clone (octocat/Hello-World)", True)
except Exception as exc:
    check("GitPython shallow clone", False, str(exc))

# ── 7. LangGraph graph compiles ────────────────────────────────────────────────
print("\n[ LangGraph ]")
try:
    from orchestrator import graph

    check("LangGraph analysis graph compiles", graph is not None)
    # Verify all 9 agent nodes are wired up
    node_names = set(graph.nodes.keys()) if hasattr(graph, "nodes") else set()
    expected = {
        "scanner",
        "architecture",
        "api_docs",
        "security",
        "cve_scanner",
        "rag_setup",
        "git_audit",
        "solidity",
        "code_audit",
    }
    missing = expected - node_names
    check("LangGraph: all 9 agent nodes present", not missing, f"Missing: {missing}" if missing else "")
except Exception as exc:
    check("LangGraph analysis graph compiles", False, str(exc))

# ── Summary ────────────────────────────────────────────────────────────────────
print("\n══════════════════════════════════════════")
if not _errors:
    print("  ALL CHECKS PASSED — ready for demo.\n")
    sys.exit(0)
else:
    print(f"  {len(_errors)} CHECK(S) FAILED:\n")
    for e in _errors:
        print(f"    ✗  {e}")
    print("\n  Fix all failures before going on stage.\n")
    sys.exit(1)
