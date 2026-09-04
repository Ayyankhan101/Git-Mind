from operator import add
from typing import Annotated, TypedDict


class RepoState(TypedDict):
    # ── Input ─────────────────────────────────────────────────────────────────
    repo_url: str
    gh_token: str | None
    sha_hint: str | None  # caller-resolved target commit, if known — see agents/scanner.py

    # ── Scanner output ────────────────────────────────────────────────────────
    local_path: str | None
    file_tree: list[str]
    file_contents: dict[str, str]
    repo_name: str
    head_sha: str | None

    # ── Parallel agent outputs (each written by exactly one agent) ────────────
    architecture_diagram: str | None
    api_docs: list[dict]
    security_findings: list[dict]
    cve_findings: list[dict]
    chroma_collection_name: str | None
    git_audit: dict | None
    solidity_audit: dict | None
    code_audit: list[dict] | None

    # ── Chat (mutated per /chat HTTP request, not by the graph) ───────────────
    chat_history: list[dict]  # [{role: "user"|"assistant", content: str}]

    # ── Crisis Mode stretch ───────────────────────────────────────────────────
    selected_finding_id: str | None
    crisis_messages: Annotated[list[dict], add]  # multi-writer → merge
    crisis_turn: int  # always init to 0 in main.py
    public_signals: Annotated[list[str], add]  # multi-writer → merge
    reporter_published: bool
    crisis_resolved: bool

    # ── Audit stream (every node appends here — MUST use add reducer) ─────────
    events: Annotated[list[dict], add]


# ── Schema metadata (derived from RepoState) ──────────────────────────────────
# Single source of truth: add a field to RepoState, defaults/visibility propagate.

_DEFAULTS: dict = {
    "repo_url": "",
    "gh_token": None,
    "sha_hint": None,
    "local_path": None,
    "file_tree": [],
    "file_contents": {},
    "repo_name": "",
    "head_sha": None,
    "architecture_diagram": None,
    "api_docs": [],
    "security_findings": [],
    "cve_findings": [],
    "chroma_collection_name": None,
    "git_audit": None,
    "solidity_audit": None,
    "code_audit": None,
    "chat_history": [],
    "selected_finding_id": None,
    "crisis_messages": [],
    "crisis_turn": 0,
    "public_signals": [],
    "reporter_published": False,
    "crisis_resolved": False,
    "events": [],
}

# Fields stripped before persistence (sensitive or internal)
_INTERNAL_FIELDS: frozenset[str] = frozenset(
    {
        "gh_token",
        "sha_hint",
        "local_path",
        "file_contents",
        "chroma_collection_name",
        "chat_history",
    }
)

# Derived: all fields minus internal = public (for API exposure)
PUBLIC_FIELDS: tuple[str, ...] = tuple(k for k in _DEFAULTS if k not in _INTERNAL_FIELDS)


def initial_state(repo_url: str, gh_token: str | None = None) -> dict:
    """Create initial RepoState with defaults. Single source of truth."""
    return {**_DEFAULTS, "repo_url": repo_url, "gh_token": gh_token}
