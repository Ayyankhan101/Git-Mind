from typing import TypedDict, Annotated
from operator import add


class RepoState(TypedDict):
    # ── Input ─────────────────────────────────────────────────────────────────
    repo_url: str

    # ── Scanner output ────────────────────────────────────────────────────────
    local_path:    str | None
    file_tree:     list[str]
    file_contents: dict[str, str]
    repo_name:     str
    head_sha:      str | None

    # ── Parallel agent outputs (each written by exactly one agent) ────────────
    architecture_diagram:   str | None
    api_docs:               list[dict]
    security_findings:      list[dict]
    cve_findings:           list[dict]
    chroma_collection_name: str | None

    # ── Chat (mutated per /chat HTTP request, not by the graph) ───────────────
    chat_history: list[dict]   # [{role: "user"|"assistant", content: str}]

    # ── Crisis Mode stretch ───────────────────────────────────────────────────
    selected_finding_id: str | None
    crisis_messages:     Annotated[list[dict], add]   # multi-writer → merge
    crisis_turn:         int                          # always init to 0 in main.py
    public_signals:      Annotated[list[str], add]    # multi-writer → merge
    reporter_published:  bool
    crisis_resolved:     bool

    # ── Audit stream (every node appends here — MUST use add reducer) ─────────
    events: Annotated[list[dict], add]
