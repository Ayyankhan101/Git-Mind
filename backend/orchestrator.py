import time

import structlog
from langgraph.graph import END, START, StateGraph

from agents.api_doc import run_api_doc_agent
from agents.architecture import run_with_graph
from agents.cve_scanner import run_cve_scanner
from agents.git_audit import run_git_audit
from agents.language_audit import run_code_audit
from agents.rag_setup import run_rag_setup
from agents.scanner import clone_and_scan
from agents.security import _synthetic_finding, run_security_agent
from agents.solidity_agent import solidity_agent
from state import RepoState

logger = structlog.get_logger(__name__)

# Circuit breaker state
_circuit_open_until = 0.0
_CIRCUIT_BREAKER_THRESHOLD = 3
_CIRCUIT_BREAKER_COOLDOWN = 60.0
_circuit_failures = 0


def _is_circuit_open() -> bool:
    global _circuit_open_until
    import time

    return time.time() < _circuit_open_until


def _record_circuit_failure():
    global _circuit_failures, _circuit_open_until
    _circuit_failures += 1
    if _circuit_failures >= _CIRCUIT_BREAKER_THRESHOLD:
        import time

        _circuit_open_until = time.time() + _CIRCUIT_BREAKER_COOLDOWN
        logger.warning("Circuit breaker opened", cooldown=_CIRCUIT_BREAKER_COOLDOWN)


def _record_circuit_success():
    global _circuit_failures
    _circuit_failures = 0


def reset_circuit_breaker():
    """Reset circuit breaker state — called on startup."""
    global _circuit_failures, _circuit_open_until
    _circuit_failures = 0
    _circuit_open_until = 0.0
    logger.info("Circuit breaker reset")


def get_circuit_breaker_state() -> dict:
    """Return current circuit breaker state for health checks."""
    import time

    now = time.time()
    return {
        "failures": _circuit_failures,
        "open": now < _circuit_open_until,
        "cooldown_remaining": max(0, _circuit_open_until - now),
    }


# ── Event factory ──────────────────────────────────────────────────────────────


def _event(agent: str, status: str, detail: str | None = None) -> dict:
    return {"agent": agent, "status": status, "ts": time.time(), "detail": detail}


# ── Node helper ────────────────────────────────────────────────────────────────
# Higher-order function that handles scanner-fail guard, circuit-breaker guard,
# try/catch, and event emission. Each agent node becomes a one-liner.


def run_agent_node(
    name: str,
    fn: "callable",
    state: RepoState,
    *,
    default: dict | None = None,
    fallback: "callable | None" = None,
) -> dict:
    """Run an agent function with standard error isolation.

    Args:
        name: Agent name for events (e.g. "architecture", "security").
        fn: Callable that receives state and returns a dict to merge.
        state: Current RepoState.
        default: Safe default dict on scanner-fail or circuit-breaker open.
        fallback: Optional callable(state, exc) -> dict for custom error recovery.
    """
    from agent_types import validate_agent_output

    if state.get("_scanner_failed"):
        return {
            **(default or {}),
            "events": [_event(name, "skipped", "scanner failed")],
        }
    if _is_circuit_open():
        return {
            **(default or {}),
            "events": [_event(name, "skipped", "circuit breaker open")],
        }
    try:
        result = fn(state)
        validate_agent_output(name, result)
        _record_circuit_success()
        return {**result, "events": [_event(name, "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("%s_node failed: %s", name, exc)
        if fallback:
            return {
                **fallback(state, exc),
                "events": [_event(name, "error", str(exc)[:500])],
            }
        return {**(default or {}), "events": [_event(name, "error", str(exc)[:500])]}


# ── Node functions ─────────────────────────────────────────────────────────────


def scanner_node(state: RepoState) -> dict:
    try:
        result = clone_and_scan(state["repo_url"], state.get("gh_token"))
        return {**result, "events": [_event("scanner", "done")]}
    except Exception as exc:
        logger.error("scanner_node failed: %s", exc)
        return {
            "local_path": None,
            "file_tree": [],
            "file_contents": {},
            "repo_name": "unknown",
            "_scanner_failed": True,
            "events": [_event("scanner", "error", str(exc)[:500])],
        }


def _architecture_fallback(state: RepoState, exc: Exception) -> dict:  # noqa: ARG001
    from agents.architecture import _fallback_mermaid

    return {
        "architecture_diagram": _fallback_mermaid(state.get("file_tree", [])),
        "architecture_graph": {"nodes": [], "edges": []},
    }


def _security_fallback(state: RepoState, exc: Exception) -> dict:  # noqa: ARG001
    return {"security_findings": _synthetic_finding()}


def _architecture_fn(state: RepoState) -> dict:
    result = run_with_graph(state["file_tree"], state["file_contents"])
    return {
        "architecture_diagram": result["architecture_diagram"],
        "architecture_graph": result["architecture_graph"],
    }


def architecture_node(state: RepoState) -> dict:
    return run_agent_node(
        "architecture", _architecture_fn, state, fallback=_architecture_fallback
    )


def api_doc_node(state: RepoState) -> dict:
    return run_agent_node(
        "api_docs",
        lambda s: {"api_docs": run_api_doc_agent(s["file_contents"])},
        state,
        default={"api_docs": []},
    )


def security_node(state: RepoState) -> dict:
    return run_agent_node(
        "security",
        lambda s: {"security_findings": run_security_agent(s["local_path"] or "")},
        state,
        default={"security_findings": []},
        fallback=_security_fallback,
    )


def rag_setup_node(state: RepoState) -> dict:
    return run_agent_node(
        "chat",
        lambda s: {
            "chroma_collection_name": run_rag_setup(
                s["file_contents"], s["repo_name"], s["repo_url"]
            )
        },
        state,
        default={"chroma_collection_name": None},
    )


def cve_node(state: RepoState) -> dict:
    return run_agent_node(
        "cve_scanner",
        lambda s: {"cve_findings": run_cve_scanner(s["file_contents"])},
        state,
        default={"cve_findings": []},
    )


def sol_node(state: RepoState) -> dict:
    return run_agent_node(
        "solidity",
        lambda s: {"solidity_audit": solidity_agent(dict(s)).get("solidity_audit")},
        state,
        default={"solidity_audit": None},
    )


def code_audit_node(state: RepoState) -> dict:
    return run_agent_node(
        "code_audit",
        lambda s: {"code_audit": run_code_audit(s["file_tree"], s["file_contents"])},
        state,
        default={"code_audit": None},
    )


def git_audit_node(state: RepoState) -> dict:
    return run_agent_node(
        "git_audit",
        lambda s: {
            "git_audit": run_git_audit(
                s["repo_url"], s["file_tree"], s["file_contents"], s.get("gh_token")
            )
        },
        state,
        default={"git_audit": None},
    )


# ── Graph definition ───────────────────────────────────────────────────────────


def build_graph() -> StateGraph:
    g = StateGraph(RepoState)

    g.add_node("scanner", scanner_node)
    g.add_node("architecture", architecture_node)
    g.add_node("api_docs", api_doc_node)
    g.add_node("security", security_node)
    g.add_node("rag_setup", rag_setup_node)
    g.add_node("cve_scanner", cve_node)
    g.add_node("git_audit", git_audit_node)
    g.add_node("solidity", sol_node)
    g.add_node("code_audit", code_audit_node)

    g.add_edge(START, "scanner")

    # Parallel fan-out after scanner
    for node in (
        "architecture",
        "api_docs",
        "security",
        "rag_setup",
        "cve_scanner",
        "git_audit",
        "solidity",
        "code_audit",
    ):
        g.add_edge("scanner", node)
        g.add_edge(node, END)

    return g.compile()  # type: ignore[return-value]


# Singleton — compiled once at import time, reused across all WebSocket sessions
graph = build_graph()
logger.info("LangGraph analysis graph compiled and ready")


# ── Crisis graph (Section 9 — stretch) ────────────────────────────────────────


def build_crisis_graph():
    """
    Section 9: Engineering briefs first, then router rotates CEO/Legal/Engineering
    until reporter publishes, crisis resolved, or 10-turn cap reached.
    """
    from agents.crisis.ceo import ceo_node
    from agents.crisis.engineer import engineer_node
    from agents.crisis.legal import legal_node
    from agents.crisis.router import crisis_router

    g = StateGraph(RepoState)
    g.add_node("ceo", ceo_node)
    g.add_node("legal", legal_node)
    g.add_node("engineer", engineer_node)

    # Engineering briefs first (Section 9.1 step 3)
    g.add_edge(START, "engineer")

    # After each agent speaks, router decides next node OR ends
    for node in ("ceo", "legal", "engineer"):
        g.add_conditional_edges(
            node,
            crisis_router,
            {"ceo": "ceo", "legal": "legal", "engineer": "engineer", "END": END},
        )

    return g.compile()


crisis_graph = build_crisis_graph()
logger.info("LangGraph crisis graph compiled and ready")
