import logging
import time

from langgraph.graph import END, START, StateGraph

from agents.api_doc import run_api_doc_agent
from agents.architecture import run_architecture_agent
from agents.rag_setup import run_rag_setup
from agents.scanner import clone_and_scan
from agents.security import _synthetic_finding, run_security_agent
from state import RepoState

logger = logging.getLogger(__name__)


# ── Event factory ──────────────────────────────────────────────────────────────

def _event(agent: str, status: str, detail: str | None = None) -> dict:
    return {"agent": agent, "status": status, "ts": time.time(), "detail": detail}


# ── Node functions ─────────────────────────────────────────────────────────────
# Each node is fully error-isolated: a failure returns safe defaults + an error
# event. The rest of the parallel pipeline continues unaffected.

def scanner_node(state: RepoState) -> dict:
    try:
        result = clone_and_scan(state["repo_url"])
        return {**result, "events": [_event("scanner", "done")]}
    except Exception as exc:
        logger.error("scanner_node failed: %s", exc)
        return {
            "local_path":    None,
            "file_tree":     [],
            "file_contents": {},
            "repo_name":     "unknown",
            "events":        [_event("scanner", "error", str(exc))],
        }


def architecture_node(state: RepoState) -> dict:
    try:
        diagram = run_architecture_agent(state["file_tree"], state["file_contents"])
        return {"architecture_diagram": diagram, "events": [_event("architecture", "done")]}
    except Exception as exc:
        logger.error("architecture_node failed: %s", exc)
        return {
            "architecture_diagram": "graph TD\n    A[Architecture Analysis Failed]",
            "events": [_event("architecture", "error", str(exc))],
        }


def api_doc_node(state: RepoState) -> dict:
    try:
        docs = run_api_doc_agent(state["file_contents"])
        return {"api_docs": docs, "events": [_event("api_docs", "done")]}
    except Exception as exc:
        logger.error("api_doc_node failed: %s", exc)
        return {"api_docs": [], "events": [_event("api_docs", "error", str(exc))]}


def security_node(state: RepoState) -> dict:
    try:
        findings = run_security_agent(state["local_path"] or "")
        return {"security_findings": findings, "events": [_event("security", "done")]}
    except Exception as exc:
        logger.error("security_node failed: %s", exc)
        return {
            "security_findings": _synthetic_finding(),
            "events": [_event("security", "error", str(exc))],
        }


def rag_setup_node(state: RepoState) -> dict:
    try:
        name = run_rag_setup(state["file_contents"], state["repo_name"], state["repo_url"])
        return {"chroma_collection_name": name, "events": [_event("chat", "done")]}
    except Exception as exc:
        logger.error("rag_setup_node failed: %s", exc)
        return {
            "chroma_collection_name": None,
            "events": [_event("chat", "error", str(exc))],
        }


# ── Graph definition ───────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    g = StateGraph(RepoState)

    g.add_node("scanner",      scanner_node)
    g.add_node("architecture", architecture_node)
    g.add_node("api_docs",     api_doc_node)
    g.add_node("security",     security_node)
    g.add_node("rag_setup",    rag_setup_node)

    g.add_edge(START, "scanner")

    # Parallel fan-out: all four run concurrently once scanner finishes
    for node in ("architecture", "api_docs", "security", "rag_setup"):
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
    from agents.crisis.legal import legal_node
    from agents.crisis.engineer import engineer_node
    from agents.crisis.router import crisis_router

    g = StateGraph(RepoState)
    g.add_node("ceo",      ceo_node)
    g.add_node("legal",    legal_node)
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
