# Architecture

System overview, agent pipeline, storage and auth layers, and the Rust
native acceleration path.

## Architecture

### System Overview

```mermaid
flowchart LR
  subgraph FE["Frontend"]
    UI["React / appReducer"]
  end

  subgraph BE["Backend (FastAPI)"]
    REST["REST API"]
    WS["WebSocket"]
    ORCH["LangGraph\nOrchestrator"]
    MONITOR["Background\nMonitor"]
  end

  subgraph EXT["External APIs"]
    GROQ["Groq LLM\ngpt-oss-120b"]
    OSV["OSV.dev"]
    GH["GitHub API\n+ git clone"]
  end

  UI <-->|"REST + WS\nport 8002"| REST & WS
  REST & WS --> ORCH
  MONITOR -.->|SHA polling| ORCH
  ORCH --> GROQ
  ORCH --> OSV
  ORCH --> GH
```

### Agent Pipeline

All 9 agents run **in parallel** after scanning. Each is fully error-isolated — a failure returns safe defaults.

```mermaid
flowchart LR
  subgraph PIPE["9-Agent Pipeline"]
    SCANNER["Scanner\nclone + index"]
    A1["Architecture"]
    A2["API Docs"]
    A3["Security\nsemgrep"]
    A4["CVE\nOSV.dev"]
    A5["Git Audit"]
    A6["Solidity"]
    A7["Code Audit"]
    A8["RAG\nEmbedding"]
    A9["Blame\nEnrichment"]
  end

  subgraph RUST["Rust Native"]
    PYO3["gitmind_core\nPyO3"]
    SIDECAR["solang\nsidecar :8003"]
  end

  SCANNER --> A1 & A2 & A3 & A4 & A5 & A6 & A7 & A8 & A9
  SCANNER -.->|lockfiles, secrets| PYO3
  A3 & A5 & A8 -.->|scanning| PYO3
  A6 -.->|.sol AST| SIDECAR
```

### Storage & Auth

```mermaid
flowchart TB
  subgraph STORE["Persistence"]
    DB[("SQLite /\nPostgreSQL")]
    REDIS[("Redis\nrate limiter")]
    CHROMA[("ChromaDB\nvectors")]
    CACHE[("diskcache\nLLM cache")]
  end

  subgraph AUTH["Auth"]
    PAT["PAT via Cmd+K\nAES-GCM"]
    TOKEN["GITHUB_TOKEN\nenv var"]
    KEY["GITMIND_SERVICE_KEY\nCI bypass"]
  end

  ORCH["Orchestrator"] --> DB
  MONITOR["Monitor"] --> DB
  REST["REST"] --> DB
  AGENT["RAG Agent"] --> CHROMA
  AGENT --> REDIS
  ORCH --> REDIS
  ORCH --> CACHE
  PAT -.->|private repos| GH["GitHub API"]
  TOKEN -.->|5K req/hr| GH
```

> **Solid lines** = primary data flow. **Dashed lines** = indirect calls.

---

## Rust Native Acceleration

> **240 lines of Rust replace 341 lines of Python regex** — zero IPC overhead, compiled via PyO3.

| Function                 | Replaces                                     | Speed-up                        |
| ------------------------ | -------------------------------------------- | ------------------------------- |
| `parse_dependencies()`   | 12 lockfile parsers in Python                | Single-pass `RegexSet` matching |
| `scan_secrets()`         | Loop of 11 regex patterns                    | O(1) vs O(n) per file           |
| `scan_sensitive_files()` | File path pattern matching                   | Compiled regex                  |
| `scan_route_files()`     | Route detection                              | Single-pass                     |
| `compute_docs_score()`   | Comment/docstring ratio                      | RegexSet batch                  |
| `split_text()`           | LangChain's `RecursiveCharacterTextSplitter` | Compiled Rust                   |
| `batch_blame()`          | Per-finding subprocess calls                 | Single git invocation per file  |

### Solidity Sidecar

Standalone Axum HTTP server (port 8003) using `solang-parser` for Solidity AST extraction. Runs as a separate Docker container.
