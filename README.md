<p align="center">
  <h1 align="center">🧠 Git-Mind</h1>
  <p align="center"><strong>Multi-agent repository intelligence platform</strong></p>
  <p align="center">Enter a GitHub username — 9 AI agents run in parallel and produce architecture diagrams, security audits, CVE scans, code analysis, and a shareable report.</p>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.2.0-blue.svg?cacheSeconds=2592000" />
  <a href="https://github.com/Ayyankhan101/Git-Mind/actions"><img src="https://github.com/Ayyankhan101/Git-Mind/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/backend/tests/"><img src="https://img.shields.io/badge/backend-405%20tests-brightgreen" alt="Backend Tests"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/frontend/src/"><img src="https://img.shields.io/badge/frontend-181%20tests-brightgreen" alt="Frontend Tests"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/master/LICENSE" target="_blank">
    <img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" />
  </a>
  <a href="https://huggingface.co/spaces/Ak001z/gitmind-backend"><img src="https://img.shields.io/badge/Backend-Hugging%20Face-orange" alt="HF Spaces"></a>
  <a href="https://gitmind-frontend.pages.dev"><img src="https://img.shields.io/badge/Frontend-Cloudflare%20Pages-blue" alt="Cloudflare Pages"></a>
</p>

---

## Live Demo

|     | Link                                                                           | Notes                                             |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| 🖥️  | **[gitmind-frontend.pages.dev](https://gitmind-frontend.pages.dev)** | React frontend — enter a GitHub username to start |
| ⚙️  | **[ak001z-gitmind-backend.hf.space](https://ak001z-gitmind-backend.hf.space)** | FastAPI backend — Hugging Face Spaces (Docker)    |

> **Tip:** Enter a GitHub PAT in the command bar (`⌘K`) to access private repos and enable auto-fix PRs.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quickstart](#quickstart)
- [Environment Variables](#️-environment-variables-30)
- [Project Layout](#️-project-layout)
- [API Endpoints (25)](#-api-endpoints-25)
- [Rust Native Acceleration](#rust-native-acceleration)
- [RAG Pipeline](#rag-pipeline)
- [Persistence](#persistence)
- [Rate Limiting](#rate-limiting)
- [Telemetry](#telemetry)
- [GitHub Authentication](#github-authentication)
- [CI/CD](#cicd)
- [Testing](#testing)
- [Deployment](#deployment)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Contributing](#contributing)
- [Author](#author)
- [License](#-license)

---

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

## Features

### 🔍 Core Analysis

| Feature                       | What it does                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🏛️ **Architecture diagram**   | Mermaid graph of component relationships using 24K-token context; pan/zoom/fullscreen with keyboard shortcuts                                                  |
| 📡 **API doc agent**          | Extracts every HTTP endpoint (method, route, description, parameters, auth) across FastAPI, Flask, Express, Django, Rails, Spring, NestJS, Gin, Echo, and more |
| 🔒 **Security auditor**       | semgrep SAST scan triaged by Groq (gpt-oss-120b); findings ranked Critical → Low with exploit scenario + remediation                                                 |
| 🛡️ **CVE scanner**            | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — PyPI, npm, Cargo, Go, Ruby, PHP. Parsers accelerated by Rust native module                    |
| 📋 **Git audit**              | Commit log analysis (100 commits): message quality, secret detection, sensitive file tracking                                                                  |
| ⛓️ **Solidity/Web3 audit**    | Parses `.sol` files via Rust sidecar (solang-parser), then LLM-triage for reentrancy, access control, oracle manipulation, etc.                                |
| 🔍 **Code audit**             | Per-language static analysis (pylint, eslint, go vet, clippy) with LLM triage for Python, JS/TS, Go, Rust, Java                                                |
| 📊 **Structured LLM outputs** | Summary, PR review, and incident report return structured JSON — parsed deterministically, no markdown fragility                                               |
| 🔍 **RAG pipeline**           | Hybrid search (ChromaDB + BM25 FTS5), cross-encoder reranker, language-aware chunking, context dedup by file+content prefix                                    |

### 🛠️ Developer Experience

| Feature                            | What it does                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🩹 **Auto-fix patches**            | Click "Generate Fix" → unified diff patch from LLM + RAG; click "Open PR" → auto-commit and open a GitHub PR                                                                                                                                                                         |
| 👀 **PR review**                   | Paste any GitHub PR URL → structured review with file:line issues and verdict; cached by PR head SHA                                                                                                                                                                                 |
| 📊 **Predictive PR impact**        | Enter a PR URL → LLM merge-risk prediction (low/medium/high/critical) with health score delta                                                                                                                                                                                        |
| 💬 **RAG chat**                    | Ask anything about the codebase; ChromaDB (8 context chunks) + source badges + streaming SSE                                                                                                                                                                                         |
| 🆘 **Crisis Mode**                 | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if the team is too slow                                                                                                                                                                  |
| 📄 **Shareable links**             | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL                                                                                                                                                                                                              |
| ⬇️ **Export report**               | Full analysis as PDF with syntax-highlighted code blocks, cached by session for instant re-download                                                                                                                                                                                  |
| 📊 **Live health score**           | Incremental health grade streams during analysis — see score update in real-time as agents complete                                                                                                                                                                                  |
| 🎨 **4 color themes** | Theme switcher in the command bar (`⌘K` → token popover) — Coral (default), Ocean, Forest, Sunset; 3 density modes (comfortable/compact/spacious); cream/coral token-based design system; respects `prefers-reduced-motion` |
| 🖥️ **Editorial landing page**      | Split-screen hero with live health-grade preview, "how it works" steps, stats strip, and a themed footer with GitHub link; responsive with mobile hamburger menu                                                                                                                     |

### 🏢 Enterprise / Ops

| Feature                       | What it does                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 🏢 **Org-wide CVE dashboard** | Scan all loaded repos for CVEs via GitHub API — cross-repo shared vulnerability detection                                     |
| 🔄 **Repository monitoring**  | Subscribe repos — background loop fetches latest shas, triggers re-analysis on change                                         |
| 🔔 **Webhook notifications**  | Push analysis results to external URLs for CI/CD integration                                                                  |
| 📧 **Email notifications**    | Optional SMTP alerts on monitoring score changes                                                                              |
| 🚀 **CI/CD integration**      | 4 GitHub Actions workflows: build, CI (lint + tests + deploy), PR analysis (auto-comment), weekly monitoring (Slack + issues) |

---

## Quickstart

### 🐳 Docker (recommended)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...
docker compose up -d --build
# Frontend: http://localhost:80
# Backend:  http://localhost:8002/health
```

<details>
<summary><strong>🔧 Dev mode (hot-reload)</strong></summary>

```bash
docker compose -f docker-compose.dev.yml up -d --build
# Frontend: http://localhost:3002
# Backend:  http://localhost:8002/health
```

</details>

<details>
<summary><strong>🖥️ Bare-metal (no Docker)</strong></summary>

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...
# Set DATABASE_URL=sqlite+aiosqlite:////tmp/gitmind.db  (default)

./start.sh          # starts backend (:8002) + frontend (:3000)
./stop.sh           # stops both
./stop.sh restart   # restart both
```

**Rust native module required:**

```bash
cd rust-gitmind && pip install maturin && maturin build --release && pip install target/wheels/gitmind_core*.whl
```

**PostgreSQL locally:**

```bash
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/gitmind
```

Logs are written to `logs/backend.log` and `logs/frontend.log`.

</details>

---

<details>
<summary><strong>Environment Variables (30)</strong></summary>

**Required**

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `GROQ_API_KEY` | Groq API key — free at [console.groq.com](https://console.groq.com)       |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `https://gitmind-frontend.pages.dev`) |

**Database & Storage**

| Variable       | Default                               | Description                                            |
| -------------- | ------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL` | `sqlite+aiosqlite:////tmp/gitmind.db` | SQLite for dev; `postgresql+asyncpg://...` for prod    |
| `DATABASE_READ_REPLICA_URL` | —                        | Optional read replica — the 4 read-only history/lookup queries route here instead of `DATABASE_URL`; writes always target `DATABASE_URL` |
| `REDIS_URL`    | —                                     | Enables shared rate limiter, session cache, task queue |
| `QDRANT_URL`   | —                                     | Switch RAG vector search from embedded ChromaDB to a Qdrant sidecar (needed once you run >1 backend worker/replica — see `docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md`) |
| `REQUIRE_REDIS`| `false`                               | When `true`, rate limiter/session store/Redis client fail closed instead of falling back to per-process memory when Redis is down |
| `CLONE_CACHE_BUCKET` | —                                | S3-compatible bucket for caching shallow-clone bundles by repo+SHA — avoids re-cloning the same commit for a repeat PR-impact run or an org-audit that overlaps an already-analyzed repo. Configure a lifecycle rule (~7 days) on the bucket; not tracked in-app |
| `CLONE_CACHE_ENDPOINT_URL` | —                          | Override for non-AWS S3-compatible storage (Cloudflare R2, MinIO, etc.) |

**Authentication & Security**

| Variable                     | Description                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`               | Server-side PAT — raises rate limit to 5,000 req/hr                                   |
| `WS_AUTH_SECRET`             | WebSocket auth — when set, clients must send matching `ws_auth_secret` + `ws_auth_ts` |
| `GITMIND_SERVICE_KEY`        | CI/service key — bypasses rate limits (`X-Service-Key` header)                        |
| `GITHUB_APP_ID`              | GitHub App credentials (webhook flows)                                                |
| `GITHUB_APP_PRIVATE_KEY`     | GitHub App private key (webhook flows)                                                |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App installation ID (webhook flows)                                            |
| `GITHUB_APP_WEBHOOK_SECRET`  | GitHub App webhook HMAC secret                                                        |
| `GITHUB_OAUTH_CLIENT_ID`     | GitHub OAuth App client ID — powers the "Sign in with GitHub" button (distinct from the GitHub App above) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret                                                        |
| `OAUTH_REDIRECT_BASE_URL`    | Backend's own public URL, for the redirect_uri sent to GitHub (default: `https://ak001z-gitmind-backend.hf.space`) |
| `OAUTH_FRONTEND_URL`         | Frontend origin the browser returns to after sign-in (default: `https://gitmind-frontend.pages.dev`) |

**Observability**

| Variable                      | Description                               |
| ----------------------------- | ----------------------------------------- |
| `SENTRY_DSN`                  | Sentry DSN for error tracking             |
| `ENVIRONMENT`                 | Environment tag (`production`, `staging`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry OTLP gRPC endpoint          |
| `JSON_LOGS`                   | Enable JSON structured logging            |
| `LOG_LEVEL`                   | Logging level (default: `INFO`)           |

**Email (SMTP alerts)**

| Variable        | Description                       |
| --------------- | --------------------------------- |
| `SMTP_HOST`     | SMTP server for monitoring alerts |
| `SMTP_PORT`     | SMTP port (default `587`)         |
| `SMTP_USER`     | SMTP username                     |
| `SMTP_PASSWORD` | SMTP password                     |
| `SMTP_FROM`     | Sender address                    |

**Tuning**

| Variable                   | Default                                | Description                                            |
| -------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `LLM_MODEL`                | `openai/gpt-oss-120b`                  | Override Groq model for all agents                     |
| `LLM_MODEL_FALLBACK`       | `llama-3.1-8b-instant`                 | Same-provider fallback — tried automatically if `LLM_MODEL` fails (deprecation, rate-limit); set to `""` to disable |
| `LLM_MODEL_CHEAP`          | `llama-3.1-8b-instant`                 | Cheap tier for high-volume, low-judgment agents only (API doc extraction, lint triage) — everything security-critical or user-facing (chat, fix, PR review, security/Solidity triage, incident reports) always uses `LLM_MODEL` |
| `RERANKER_MODEL`           | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder reranker model                           |
| `SIDECAR_URL`              | `http://127.0.0.1:8003`                | Solidity parser sidecar endpoint                       |
| `TASK_WORKERS`             | `3`                                    | Background task queue worker count                     |
| `MONITOR_INTERVAL_SECONDS` | `3600`                                 | Repo monitoring loop interval                          |
| `REPORTER_INTERVAL_SEC`    | `45`                                   | Crisis Mode reporter check interval                    |
| `MAX_REQUEST_BODY_BYTES`   | `5242880` (5 MB)                       | Max request body size                                  |
| `GROQ_DAILY_REMAINING`     | —                                      | Daily token window guard for MIPROv2 self-optimization |
| `DEBUG`                    | —                                      | Enable health check debug info                         |

</details>

---

<details>
<summary><strong>Project Layout</strong></summary>

```
Git-Mind/
├── docker-compose.yml              ← Production compose
├── docker-compose.dev.yml          ← Dev compose (hot-reload)
├── Dockerfile                      ← Multi-stage: rust → backend → frontend → runner
├── start.sh / stop.sh              ← Bare-metal launcher
│
├── backend/
│   ├── main.py                     ← FastAPI app
│   ├── orchestrator.py             ← LangGraph analysis + crisis graphs (9-agent DAG)
│   ├── state.py                    ← RepoState TypedDict
│   ├── settings.py                 ← Centralized LLM config (model, temps, factory)
│   ├── llm_cache.py                ← diskcache + invoke_json_with_retry
│   ├── chroma_utils.py             ← ChromaDB helpers + hybrid search
│   ├── agents/                     ← 9 LangGraph agent nodes + crisis sub-agents
│   ├── routes/                     ← REST API endpoints
│   ├── ws/                         ← WebSocket handlers (analyze, crisis)
│   ├── models/                     ← SQLAlchemy + Pydantic
│   ├── services/                   ← Auth, cache, rate limiter, BM25 FTS5, reranker
│   ├── alembic/                    ← Database migrations
│   └── tests/                      ← 405 pytest tests
│
├── rust-gitmind/                   ← PyO3 native module (gitmind_core)
│   └── src/
│       ├── lib.rs                  ← Module entry point
│       ├── dep_parsers.rs          ← 12 lockfile parsers
│       ├── blame.rs                ← Batch git blame
│       ├── text_splitter.rs        ← Recursive text splitter
│       └── file_scanner.rs         ← Secrets, routes, comment ratio
│
├── rust-sidecar/                   ← Solidity parser HTTP sidecar
│   └── src/
│       ├── main.rs                 ← Axum server (port 8003)
│       └── parser.rs               ← solang-parser → AST extraction
│
├── .github/workflows/              ← CI/CD pipelines
└── frontend/
    └── src/
        ├── App.jsx                 ← Root component (useReducer state)
        ├── appReducer.js           ← Typed actions + state transitions
        ├── api.js                  ← All API calls (postChatStream with sources)
        ├── pdfBuilder.js           ← PDF generation + caching + syntax highlighting
        ├── tokenManager.js         ← Encrypted PAT storage (AES-GCM)
        ├── components/             ← Tab components + CommandPalette
        └── ...                     ← 181 Jest tests
```

</details>

---

<details>
<summary><strong>API Endpoints (25)</strong></summary>

**Analysis**

| Endpoint                 | Method | Description                       |
| ------------------------ | ------ | --------------------------------- |
| `/ws/analyze`            | WS     | Streams agent events              |
| `/analyze`               | POST   | Triggers full pipeline            |
| `/analysis/{session_id}` | GET    | Load saved analysis snapshot      |
| `/analysis/previous`     | GET    | Last analysis for a repo          |
| `/analysis/history`      | GET    | Health trend data over time       |
| `/summary`               | POST   | Generate executive summary        |
| `/chat`                  | POST   | Ask a question about the codebase |
| `/chat/stream`           | POST   | SSE streaming chat                |
| `/fix`                   | POST   | Generate a fix patch              |

**PR Review**

| Endpoint                  | Method | Description           |
| ------------------------- | ------ | --------------------- |
| `/fix/pr`                 | POST   | Auto-create GitHub PR |
| `/pr-review`              | POST   | Review a GitHub PR    |
| `/pr-impact`              | POST   | Predict PR merge risk |
| `/pr-list/{owner}/{repo}` | GET    | List open PRs         |
| `/task/{task_id}`         | GET    | Poll background task  |

**Monitoring & Org**

| Endpoint                | Method | Description                  |
| ----------------------- | ------ | ---------------------------- |
| `/repos/{username}`     | GET    | List user repos              |
| `/monitor/subscribe`    | POST   | Subscribe to repo monitoring |
| `/monitor/status`       | GET    | List monitored repos         |
| `/monitor/{monitor_id}` | DELETE | Unsubscribe from monitoring  |
| `/org-audit`            | POST   | Cross-repo CVE scan          |
| `/webhook/notify`       | POST   | Push results to webhook      |
| `/github/webhook`       | POST   | GitHub App webhook handler   |
| `/incident-report`      | POST   | Generate incident report     |

**System**

| Endpoint     | Method | Description           |
| ------------ | ------ | --------------------- |
| `/ws/crisis` | WS     | Crisis Mode role-play |
| `/health`    | GET    | Health check          |
| `/metrics`   | GET    | Prometheus metrics    |

</details>

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

---

## RAG Pipeline

The codebase chat (`POST /chat`) uses a multi-stage retrieval pipeline:

```
User question
    ↓
ChromaDB vector search (top-20)
    ↓
BM25 keyword search via SQLite FTS5 (top-20)   ← zero external deps, built-in
    ↓
Reciprocal Rank Fusion (RRF)                    ← merges both result sets
    ↓
Cross-encoder reranker (configurable model)      ← re-scores by relevance
    ↓
Context dedup (filepath + content prefix)        ← multiple chunks per file
    ↓
Qwen3.6-27B via Groq                             ← generates answer with citations
```

### What each layer does

| Layer                      | What it does                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **ChromaDB (vector)**      | Semantic similarity search using `all-MiniLM-L6-v2` embeddings                          |
| **BM25 (FTS5)**            | SQLite FTS5 — exact term matching with zero external dependencies                       |
| **RRF fusion**             | Combines rank positions from both searchers; weighted blend (default 70/30 vector/BM25) |
| **Cross-encoder reranker** | `cross-encoder/ms-marco-MiniLM-L-6-v2` (configurable via `RERANKER_MODEL` env var)      |
| **Context dedup**          | Allows multiple chunks per file (dedup by filepath + content prefix, not filepath-only) |
| **LLM cache**              | `diskcache` (SQLite, 2 GB, 24h TTL) — instant return for repeated questions             |

### Chunking

- **Chunk size:** 800 chars / 120 overlap (15%)
- **Language-aware separators:** `.py` splits on `class`/`def`; `.js/.ts` on `export`/`function`/`class`; `.go` on `func`/`type`; `.rs` on `fn`/`struct`/`impl`
- **Rust acceleration:** `gitmind_core.split_files()` (PyO3) — 10-20x faster than Python fallback

### LLM Output Reliability

- **Structured JSON outputs:** Summary, PR review, security triage, code audit, and incident report all use `response_format={"type": "json_object"}`
- **Parse retry:** `invoke_json_with_retry()` retries up to 2x on JSON parse failure (bypasses stale cache on retries)
- **Centralized model config:** All agents use `get_llm()` from `settings.py` — single source of truth for model name and temperature

---

## Persistence

| Layer              | Technology         | Purpose                                        |
| ------------------ | ------------------ | ---------------------------------------------- |
| Analysis snapshots | SQLAlchemy + async | Session state, SHA cache, analysis results     |
| SQLite (default)   | `aiosqlite`        | Zero-config local dev                          |
| PostgreSQL (prod)  | `asyncpg`          | Production — one env var selects backend       |
| Redis (optional)   | `redis-py`         | Shared rate limiter, session cache, task queue |
| ChromaDB           | embedded           | Vector store for RAG chat (default)            |
| Qdrant (optional)  | sidecar            | Vector store for RAG chat — set `QDRANT_URL` to switch, needed for >1 backend worker |
| LLM cache          | `diskcache`        | Caches Groq API responses                      |

---

## Rate Limiting

Sliding-window limits (Redis-backed, in-memory fallback for dev) keyed by endpoint:

| Endpoint                                       | Limit  | Window |
| ---------------------------------------------- | ------ | ------ |
| `analyze`                                      | 2 req  | 60s    |
| `analyze_chat_burst` (analyze + chat combined) | 10 req | 60s    |
| `summary`                                      | 5 req  | 60s    |
| `chat`                                         | 20 req | 60s    |
| `fix`                                          | 10 req | 60s    |
| `pr`                                           | 5 req  | 60s    |
| `pr_impact`                                    | 3 req  | 60s    |
| `org_audit`                                    | 3 req  | 60s    |
| `repos`                                        | 20 req | 60s    |
| `monitor`                                      | 10 req | 60s    |
| `webhook_notify`                               | 10 req | 60s    |
| `analysis_get`                                 | 30 req | 60s    |
| `analysis_previous`                            | 20 req | 60s    |
| `analysis_history`                             | 20 req | 60s    |
| `task`                                         | 30 req | 60s    |

Requests authenticated with a valid `GITMIND_SERVICE_KEY` (`X-Service-Key` header) bypass rate limits.
Rate-limited requests return HTTP 429 with `Retry-After` header.

---

## Security

Defense-in-depth posture — 20-point checklist status:

| Control                | Status                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Hide API keys          | ✅ Env-only (`GROQ_API_KEY`, `GITHUB_TOKEN`, `SMTP_PASSWORD`); `.env` untracked                |
| Purge git secrets      | ✅ History clean (test placeholders only); `gitleaks` in pre-commit + CI `security` job        |
| Public DB key          | ✅ No DB credentials in code; env via compose                                                  |
| Row-level security     | N/A — single-tenant; access controlled per session                                             |
| Encrypt sensitive data | ✅ Frontend PAT AES-GCM (1h TTL); `gh_token` stripped before persistence                       |
| Server-side auth       | ✅ Default-deny middleware; allowlist public paths; webhook HMAC-verified                      |
| Lock record access     | ✅ Hybrid `/analysis/{id}`: public ≤24h (share-by-URL), authenticated after                    |
| Block field tampering  | ✅ Response whitelist (`_trim_analysis`) — internal fields never leave API                     |
| Secure session cookies | N/A — no cookies; PAT-header auth                                                              |
| Hash passwords         | N/A — no password auth                                                                         |
| Rate limit login       | N/A — no login; 17 endpoint windows + cross-endpoint burst guard                               |
| Bot protection         | ✅ IP-velocity burst cap (analyze + chat combined, 10/60s)                                     |
| Parameterize queries   | ✅ SQLAlchemy ORM; no user input reaches raw SQL                                               |
| Validate all inputs    | ✅ Pydantic bodies + regex validators (repo/PR/username/session UUID)                          |
| Escape user content    | ✅ react-markdown (no raw HTML) + `esc()` on DOM injection + `encodeURIComponent`              |
| Restrict file uploads  | N/A — no upload endpoints                                                                      |
| Trim API responses     | ✅ `_trim_analysis` whitelist; history/org/pr/repos return fixed shapes                        |
| Security headers       | ✅ X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP (report-only), HSTS |
| Force HTTPS            | ✅ Platform-terminated (Cloudflare Pages / HF Spaces)                                   |
| Scan dependencies      | ✅ `pip-audit` + `npm audit` in CI `security` job; Dependabot monthly                          |

---

## Telemetry

| Tool                | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `structlog`         | Structured JSON logging                                       |
| `prometheus_client` | `/metrics` — request count, latency, in-flight, task counters |
| OpenTelemetry       | Distributed tracing via OTLP                                  |
| Sentry              | Error tracking (optional, via `SENTRY_DSN`)                   |
| Correlation IDs     | `X-Request-ID` on every request                               |

---

## GitHub Authentication

| Method                      | Scope                            | How                                                                     |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **Sign in with GitHub**     | Private repos, auto-fix PRs      | OAuth button on the landing page / dashboard lock icon — same token storage as In-UI PAT below, just no manual PAT generation |
| **In-UI PAT**                | Private repos, auto-fix PRs      | Paste one via the landing page or the dashboard's lock icon — encrypted `localStorage` (AES-GCM, 1h TTL) |
| **Server `GITHUB_TOKEN`**   | Rate limit boost (60 → 5,000/hr) | Set in `backend/.env`                                                   |
| **Service key**             | CI/CD — bypasses rate limits     | `GITMIND_SERVICE_KEY` → `X-Service-Key` header                          |

> Git operations use `GIT_ASKPASS` helper — token never in URLs or logs.

---

## CI/CD

| Workflow              | Trigger               | What it does                                                                                                     |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `build.yml`           | Push/PR to any branch | Frontend production build                                                                                        |
| `ci.yml`              | Push/PR to `main`     | Ruff/mypy/Prettier lint, backend tests + Rust build, frontend tests + build, smoke + layout audits, deploy to HF |
| `gitmind-monitor.yml` | Weekly (Mon 8am UTC)  | Re-analyze, health delta, Slack alert + GitHub issue                                                             |

---

## Testing

```
✅ Backend:  405 tests passing (pytest-asyncio)
✅ Frontend:  181 tests passing (Jest + React Testing Library)
✅ Rust:      clippy + rustfmt clean
```

```bash
# Backend
cd backend && python -m pytest tests/ -v

# Frontend
cd frontend && CI=true npx react-scripts test --watchAll=false
```

---

## Deployment

| Platform                | What                   | URL                                                                                     |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| **Hugging Face Spaces** | Backend (Docker)       | [ak001z-gitmind-backend.hf.space](https://ak001z-gitmind-backend.hf.space)             |
| **Cloudflare Pages**    | Frontend (auto-deploy) | [gitmind-frontend.pages.dev](https://gitmind-frontend.pages.dev)                        |
| **Docker Compose**      | Full stack (self-host) | `docker compose up -d --build`                                                          |
| **Any Python host**     | Backend                | Render, Fly.io, EC2, etc.                                                               |

### Quick Deploy

```bash
# Self-host full stack
docker compose up -d --build

# Deploy to HF (manual)
./scripts/deploy-hf.sh

# Frontend — push to main → Cloudflare Pages auto-deploys
```

---

## Keyboard Shortcuts

| Shortcut          | Action                           |
| ----------------- | -------------------------------- |
| `⌘/Ctrl + K`      | Command palette                  |
| `⌘/Ctrl + R`      | Re-analyze                       |
| `⌘/Ctrl + 1-9, 0` | Switch tabs                      |
| `?`               | Toggle shortcut help             |
| `/`               | Focus username input             |
| `Esc`             | Dismiss / close                  |
| `+` / `-` / `0`   | Zoom in/out/reset (Architecture) |
| `F`               | Fit diagram to screen            |

---

## Contributing

Contributions welcome! Fork the repo, create a feature branch, and open a PR. CI runs automatically on all PRs.

---

## Author

**Ayyan Khan**
GitHub: [@Ayyankhan101](https://github.com/Ayyankhan101)

---

## License

Copyright © 2026 [Ayyan Khan](https://github.com/Ayyankhan101).
This project is [Apache 2.0](https://github.com/Ayyankhan101/Git-Mind/blob/master/LICENSE) licensed.
