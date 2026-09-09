"""Agent output types and validation.

Define TypedDict for each agent's output and validate at the orchestrator seam.
Validation runs always (production + tests) — cheap dict check, expensive silent data loss.
"""

from typing import TypedDict


class ScannerOutput(TypedDict, total=False):
    local_path: str | None
    file_tree: list[str]
    file_contents: dict[str, str]
    repo_name: str
    head_sha: str | None
    _scanner_failed: bool


class ArchitectureOutput(TypedDict):
    architecture_diagram: str | None
    architecture_graph: dict


class ApiDocOutput(TypedDict):
    api_docs: list[dict]


class SecurityOutput(TypedDict):
    security_findings: list[dict]


class CveOutput(TypedDict):
    cve_findings: list[dict]


class RagSetupOutput(TypedDict):
    chroma_collection_name: str | None


class GitAuditOutput(TypedDict):
    git_audit: dict | None


class SolidityOutput(TypedDict):
    solidity_audit: dict | None


class CodeAuditOutput(TypedDict):
    code_audit: list[dict] | None


# ── Validation ────────────────────────────────────────────────────────────────

_OUTPUT_TYPES: dict[str, type] = {
    "architecture": ArchitectureOutput,
    "api_docs": ApiDocOutput,
    "security": SecurityOutput,
    "cve_scanner": CveOutput,
    "chat": RagSetupOutput,
    "git_audit": GitAuditOutput,
    "solidity": SolidityOutput,
    "code_audit": CodeAuditOutput,
}


def validate_agent_output(name: str, result: dict) -> dict:
    """Validate agent output against its TypedDict. Raises ValueError on mismatch."""
    expected = _OUTPUT_TYPES.get(name)
    if expected is None:
        return result  # scanner or unknown — skip validation

    missing = set(expected.__annotations__) - set(result)
    extra = set(result) - set(expected.__annotations__) - {"events"}

    if missing:
        raise ValueError(f"Agent '{name}' output missing keys: {missing}. Expected: {list(expected.__annotations__)}")
    if extra:
        raise ValueError(
            f"Agent '{name}' output has unexpected keys: {extra}. Expected: {list(expected.__annotations__)}"
        )

    return result
