import time

import structlog
from langgraph.graph import END, START, StateGraph

from agents.api_doc import run_api_doc_agent
from agents.architecture import run_architecture_agent
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


# ── Event factory ──────────────────────────────────────────────────────────────


def _event(agent: str, status: str, detail: str | None = None) -> dict:
    return {"agent": agent, "status": status, "ts": time.time(), "detail": detail}


# ── Node functions ─────────────────────────────────────────────────────────────
# Each node is fully error-isolated: a failure returns safe defaults + an error
# event. The rest of the parallel pipeline continues unaffected.


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
            "events": [_event("scanner", "error", str(exc)[:200])],
        }


def architecture_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"architecture_diagram": None, "events": [_event("architecture", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"architecture_diagram": None, "events": [_event("architecture", "skipped", "circuit breaker open")]}
    try:
        diagram = run_architecture_agent(state["file_tree"], state["file_contents"])
        _record_circuit_success()
        return {"architecture_diagram": diagram, "events": [_event("architecture", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("architecture_node failed: %s", exc)
        return {
            "architecture_diagram": "graph TD\n    A[Architecture Analysis Failed]",
            "events": [_event("architecture", "error", str(exc)[:200])],
        }


def api_doc_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"api_docs": [], "events": [_event("api_docs", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"api_docs": [], "events": [_event("api_docs", "skipped", "circuit breaker open")]}
    try:
        docs = run_api_doc_agent(state["file_contents"])
        _record_circuit_success()
        return {"api_docs": docs, "events": [_event("api_docs", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("api_doc_node failed: %s", exc)
        return {"api_docs": [], "events": [_event("api_docs", "error", str(exc)[:200])]}


def security_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"security_findings": [], "events": [_event("security", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"security_findings": [], "events": [_event("security", "skipped", "circuit breaker open")]}
    try:
        findings = run_security_agent(state["local_path"] or "")
        _record_circuit_success()
        return {"security_findings": findings, "events": [_event("security", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("security_node failed: %s", exc)
        return {
            "security_findings": _synthetic_finding(),
            "events": [_event("security", "error", str(exc)[:200])],
        }


def rag_setup_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"chroma_collection_name": None, "events": [_event("chat", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"chroma_collection_name": None, "events": [_event("chat", "skipped", "circuit breaker open")]}
    try:
        name = run_rag_setup(state["file_contents"], state["repo_name"], state["repo_url"])
        _record_circuit_success()
        return {"chroma_collection_name": name, "events": [_event("chat", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("rag_setup_node failed: %s", exc)
        return {
            "chroma_collection_name": None,
            "events": [_event("chat", "error", str(exc)[:200])],
        }


def cve_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"cve_findings": [], "events": [_event("cve_scanner", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"cve_findings": [], "events": [_event("cve_scanner", "skipped", "circuit breaker open")]}
    try:
        findings = run_cve_scanner(state["file_contents"])
        _record_circuit_success()
        return {"cve_findings": findings, "events": [_event("cve_scanner", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("cve_node failed: %s", exc)
        return {"cve_findings": [], "events": [_event("cve_scanner", "error", str(exc)[:200])]}


def sol_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"solidity_audit": None, "events": [_event("solidity", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"solidity_audit": None, "events": [_event("solidity", "skipped", "circuit breaker open")]}
    try:
        result = solidity_agent(dict(state))
        _record_circuit_success()
        return {"solidity_audit": result.get("solidity_audit"), "events": [_event("solidity", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("sol_node failed: %s", exc)
        return {"solidity_audit": None, "events": [_event("solidity", "error", str(exc)[:200])]}


def code_audit_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"code_audit": None, "events": [_event("code_audit", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"code_audit": None, "events": [_event("code_audit", "skipped", "circuit breaker open")]}
    try:
        results = run_code_audit(state["file_tree"], state["file_contents"])
        _record_circuit_success()
        return {"code_audit": results, "events": [_event("code_audit", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("code_audit_node failed: %s", exc)
        return {"code_audit": None, "events": [_event("code_audit", "error", str(exc)[:200])]}


def git_audit_node(state: RepoState) -> dict:
    if state.get("_scanner_failed"):
        return {"git_audit": None, "events": [_event("git_audit", "skipped", "scanner failed")]}
    if _is_circuit_open():
        return {"git_audit": None, "events": [_event("git_audit", "skipped", "circuit breaker open")]}
    try:
        result = run_git_audit(
            state["repo_url"],
            state["file_tree"],
            state["file_contents"],
            state.get("gh_token"),
        )
        _record_circuit_success()
        return {"git_audit": result, "events": [_event("git_audit", "done")]}
    except Exception as exc:
        _record_circuit_failure()
        logger.error("git_audit_node failed: %s", exc)
        return {"git_audit": None, "events": [_event("git_audit", "error", str(exc)[:200])]}


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

    return g.compile()


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
