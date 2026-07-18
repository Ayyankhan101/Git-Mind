# Multi-Language Audit Agents

**Date:** 2026-06-23
**Status:** Approved / In Progress

## Problem

GitMind analyzes GitHub repos across 8 agents, but only one is language-specific (Solidity). Repos written in Python, JavaScript, TypeScript, Go, Rust, or Java receive no language-specific code quality or security audit beyond generic semgrep scanning.

## Solution

Add a new parallel agent node `code_audit` that detects languages present in the repo and runs per-language auditor functions. Each auditor prefers a native linter (pylint, eslint, go vet, clippy, checkstyle) and falls back to pure LLM analysis if the tool is not installed. All findings are merged into a single normalized output displayed in a new `CodeAuditTab` frontend component.

## Architecture

### Backend: `agents/language_audit.py`

Single dispatcher module with a registry of `AuditorDef`:

```python
@dataclass
class AuditorDef:
    extensions: frozenset[str]
    tool: tuple[str, ...] | None       # (cmd, *args) or None = pure LLM
    tool_name: str | None
    llm_prompt: str
```

Languages and corresponding tools:

| Language   | Extensions    | Tool                                        | Fallback |
| ---------- | ------------- | ------------------------------------------- | -------- |
| Python     | `.py`         | `pylint --output-format=json --recursive=y` | LLM      |
| JavaScript | `.js`, `.mjs` | `eslint -f json`                            | LLM      |
| TypeScript | `.ts`, `.tsx` | `eslint --ext .ts,.tsx -f json`             | LLM      |
| Go         | `.go`         | `go vet ./...`                              | LLM      |
| Rust       | `.rs`         | `cargo clippy --message-format=json`        | LLM      |
| Java       | `.java`       | None (LLM-only)                             | LLM-only |

### Normalized Output Schema

```python
{
    "language": str,          # e.g. "python"
    "tool": str | None,       # tool name or None if LLM fallback
    "findings": [
        {
            "id": str,
            "file": str,
            "line": int | None,
            "severity": "critical" | "high" | "medium" | "low",
            "title": str,
            "description": str,
            "remediation": str,
            "rule": str | None,   # linter rule ID
            "cwe": str | None,
        }
    ],
    "file_count": int,
    "finding_count": int,
}
```

### LLM Prompts

Each language gets a tailored prompt focusing on:

- Security anti-patterns specific to the language
- Common bugs (null pointer in Java, race conditions in Go, undefined in JS, etc.)
- Performance pitfalls
- Convention violations
- Return format: strict JSON `{"findings": [...]}` matching the schema above

### State Changes (`state.py`)

Add to `RepoState`:

```python
code_audit: list[dict] | None   # list of per-language results
```

### Orchestrator (`orchestrator.py`)

Add `code_audit_node` to the parallel fan-out after `scanner`. Same error isolation and circuit-breaker pattern as existing nodes.

### WebSocket

The node outputs `{"code_audit": [...]}` in the stream. `ws/analyze.py` passes it through like existing agent outputs.

### Frontend: `CodeAuditTab.jsx`

- **None state:** icon + "Analyze a repository"
- **Loading:** skeleton rows
- **Loaded:** language filter pills (All / Python / JS / TS / Go / Rust / Java) with finding counts; expandable finding rows with file path, severity, title, description, remediation, rule badge
- Uses existing CSS classes: `.tab-header`, `.sev-filter`, `.sev-pill`, `.row`, `.row-sev`, `.row-main`, `.row-title`, `.row-path`
- File paths link to `FilePreviewDrawer`

### App.js Changes

- Add `codeAudit` state variable
- Add WS handler: `if (data.code_audit) setCodeAudit(data.code_audit)`
- Add tab definition with icon
- Add conditional render for `CodeAuditTab`
- Add AGENT_KEYS entry for pipeline tracking

## Test Strategy

- Unit test: language detection from file tree
- Unit test: tool command construction per language
- Unit test: empty/no-match cases
- Unit test: LLM prompt construction
- Integration test: mock linter output, verify normalized findings
- Frontend: snapshot basic render states

## Deployment

- All tools are optional — no new Docker deps
- Falls back to LLM-only in CI and HF Spaces where tools not installed
