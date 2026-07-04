<p align="center">
  <h1 align="center">🧠 GitMind</h1>
  <p align="center"><strong>Multi-agent repository intelligence platform</strong></p>
  <p align="center">Enter a GitHub username — 9 AI agents run in parallel and produce architecture diagrams, security audits, CVE scans, code analysis, and a shareable report.</p>
</p>

<p align="center">
  <a href="https://github.com/Ayyankhan101/Git-Mind/actions"><img src="https://github.com/Ayyankhan101/Git-Mind/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/backend/tests/"><img src="https://img.shields.io/badge/backend-106%20tests-brightgreen" alt="Backend Tests"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/frontend/src/"><img src="https://img.shields.io/badge/frontend-70%20tests-brightgreen" alt="Frontend Tests"></a>
  <a href="https://huggingface.co/spaces/Ak001z/gitmind-backend"><img src="https://img.shields.io/badge/Backend-Hugging%20Face-orange" alt="HF Spaces"></a>
  <a href="https://gitmind-peach.vercel.app"><img src="https://img.shields.io/badge/Frontend-Vercel-blue" alt="Vercel"></a>
</p>

---

## Live Demo

|     | Link                                                                           | Notes                                             |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| 🖥️  | **[gitmind-peach.vercel.app](https://gitmind-peach.vercel.app)**               | React frontend — enter a GitHub username to start |
| ⚙️  | **[ak001z-gitmind-backend.hf.space](https://ak001z-gitmind-backend.hf.space)** | FastAPI backend — Hugging Face Spaces (Docker)    |

> **Tip:** Enter a GitHub PAT in the command bar (`⌘K`) to access private repos and enable auto-fix PRs.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quickstart](#quickstart)
- [Environment Variables](#️-environment-variables-18)
- [Project Layout](#️-project-layout)
- [API Endpoints](#-api-endpoints-19)
- [Rust Native Acceleration](#rust-native-acceleration)
- [Persistence](#persistence)
- [Rate Limiting](#rate-limiting)
- [Telemetry](#telemetry)
- [GitHub Authentication](#github-authentication)
- [CI/CD](#cicd)
- [Testing](#testing)
- [Deployment](#deployment)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Contributing](#contributing)

---

## Architecture

```mermaid
graph TB
  %% ── Styles ──────────────────────────────────────────────
  classDef frontend fill:#61dafb,stroke:#333,color:#111
  classDef backend fill:#009688,stroke:#333,color:#fff
  classDef agent fill:#e0f2f1,stroke:#004d40,color:#111
  classDef infra fill:#e8eaf6,stroke:#283593,color:#111
  classDef external fill:#fff3e0,stroke:#e65100,color:#111
  classDef rust fill:#fff8e1,stroke:#f57f17,color:#111
  classDef storage fill:#f3e5f5,stroke:#6a1b9a,color:#111

  %% ── Frontend ────────────────────────────────────────────
  subgraph FE["React Frontend (Vercel)"]
    UI["App.js / appReducer.js"]
  end

  %% ── Backend ─────────────────────────────────────────────
  subgraph BE["FastAPI Backend (HF Spaces / Docker)"]
    direction TB
    REST["REST Routes<br/>(/analyze, /fix, /chat, /pr-review, ...)"]
    WS["WebSocket<br/>(/ws/analyze, /ws/crisis)"]
    ORCH["LangGraph Orchestrator<br/>9-agent DAG"]
    CRISIS["Crisis Mode<br/>CEO / Legal / Engineering / Reporter"]
    MONITOR["Background Monitor<br/>SHA polling loop"]

    ORCH --> REST & WS
    REST --> ORCH
    WS --> ORCH
    MONITOR -.-> ORCH
  end

  %% ── Agents (inside backend) ─────────────────────────────
  subgraph AGENTS["Agent Pipeline"]
    SCANNER["Scanner Agent<br/>clone + index"]
    A1["Architecture"]
    A2["API Docs"]
    A3["Security (semgrep)"]
    A4["CVE (OSV.dev)"]
    A5["Git Audit"]
    A6["Solidity Audit"]
    A7["Code Audit"]
    A8["RAG Embedding"]
    A9["Blame Enrichment"]

    ORCH --> SCANNER
    SCANNER --> A1 & A2 & A3 & A4 & A5 & A6 & A7 & A8 & A9
  end

  %% ── Rust Native ─────────────────────────────────────────
  subgraph RUST["Rust Native"]
    PYO3["gitmind_core (PyO3)<br/>lockfile parsers, secrets,<br/>blame, text splitter"]
    SIDECAR["solang-parser sidecar<br/>Axum :8003"]
  end

  SCANNER -.-> PYO3
  A6 -.-> SIDECAR
  A3 -.-> PYO3
  A5 -.-> PYO3
  A8 -.-> PYO3

  %% ── External APIs ───────────────────────────────────────
  subgraph EXT["External APIs"]
    GROQ["Groq API<br/>llama-3.3-70b"]
    OSV["OSV.dev"]
    GH_API["GitHub API"]
    GH_CLONE["git clone<br/>(GIT_ASKPASS)"]
  end

  A1 & A2 & A3 & A4 & A5 & A6 & A7 --> GROQ
  A4 --> OSV
  SCANNER --> GH_CLONE
  A9 --> GH_API

  %% ── Storage ─────────────────────────────────────────────
  subgraph STORE["Persistence"]
    DB[("SQLite / PostgreSQL<br/>asyncpg/aiosqlite")]
    REDIS[("Redis<br/>rate limiter, queue")]
    CHROMA[("ChromaDB<br/>vector store")]
    CACHE[("diskcache<br/>LLM response cache")]
    FS[("File system<br/>cloned repos")]
  end

  ORCH --- DB
  MONITOR --- DB
  A8 --> CHROMA
  A8 -.-> REDIS
  ORCH -.-> REDIS
  REST --- DB

  %% ── Auth ────────────────────────────────────────────────
  subgraph AUTH["Auth Layer"]
    PAT["PAT via Cmd+K<br/>AES-GCM encrypted"]
    SERVER_TOKEN["GITHUB_TOKEN<br/>(env var)"]
    SERVICE_KEY["GITMIND_SERVICE_KEY<br/>(CI bypass)"]
  end

  UI --> PAT
  PAT -.-> GH_API
  PAT -.-> GH_CLONE

  %% ── CI/CD ──────────────────────────────────────────────
  subgraph CICD["CI/CD"]
    CI["ci.yml<br/>tests > build > deploy"]
    PR_CHECK["pr-analysis.yml<br/>auto-comment"]
    WEEKLY["weekly-monitor.yml<br/>Slack + issue"]
  end

  CI -.->|deploy to| BE
  CI -.->|deploy to| FE

  %% ── FE <-> BE ────────────────────────────────────────────
  UI <-->|"REST + WebSocket<br/>port 8002"| BE
```

All 9 post-scanner agents run **in parallel**. Each is fully error-isolated — a failure returns safe defaults and the rest of the pipeline continues.

> **Dashed lines** (`.->`) indicate indirect/Rust calls. **Solid lines** are primary data flow.

---

## Features

### 🔍 Core Analysis

| Feature                     | What it does                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🏛️ **Architecture diagram** | Mermaid graph of component relationships using 24K-token context; pan/zoom/fullscreen with keyboard shortcuts                                                  |
| 📡 **API doc agent**        | Extracts every HTTP endpoint (method, route, description, parameters, auth) across FastAPI, Flask, Express, Django, Rails, Spring, NestJS, Gin, Echo, and more |
| 🔒 **Security auditor**     | semgrep SAST scan triaged by llama-3.3-70b; findings ranked Critical → Low with exploit scenario + remediation                                                 |
| 🛡️ **CVE scanner**          | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — PyPI, npm, Cargo, Go, Ruby, PHP. Parsers accelerated by Rust native module                    |
| 📋 **Git audit**            | Commit log analysis (100 commits): message quality, secret detection, sensitive file tracking                                                                  |
| ⛓️ **Solidity/Web3 audit**  | Parses `.sol` files via Rust sidecar (solang-parser), then LLM-triage for reentrancy, access control, oracle manipulation, etc.                                |
| 🔍 **Code audit**           | Per-language static analysis (pylint, eslint, go vet, clippy) with LLM triage for Python, JS/TS, Go, Rust, Java                                                |

### 🛠️ Developer Experience

| Feature                     | What it does                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 🩹 **Auto-fix patches**     | Click "Generate Fix" → unified diff patch from LLM + RAG; click "Open PR" → auto-commit and open a GitHub PR        |
| 👀 **PR review**            | Paste any GitHub PR URL → structured review with file:line issues and verdict; cached by PR head SHA                |
| 📊 **Predictive PR impact** | Enter a PR URL → LLM merge-risk prediction (low/medium/high/critical) with health score delta                       |
| 💬 **RAG chat**             | Ask anything about the codebase; ChromaDB (8 context chunks) + streaming SSE                                        |
| 🆘 **Crisis Mode**          | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if the team is too slow |
| 📄 **Shareable links**      | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL                                             |
| ⬇️ **Export report**        | Download full analysis as Markdown or PDF                                                                           |

### 🏢 Enterprise / Ops

| Feature                       | What it does                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 🏢 **Org-wide CVE dashboard** | Scan all loaded repos for CVEs via GitHub API — cross-repo shared vulnerability detection      |
| 🔄 **Repository monitoring**  | Subscribe repos — background loop fetches latest shas, triggers re-analysis on change          |
| 🔔 **Webhook notifications**  | Push analysis results to external URLs for CI/CD integration                                   |
| 🚀 **CI/CD integration**      | 3 GitHub Actions workflows: CI, PR analysis (auto-comment), weekly monitoring (Slack + issues) |

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
# Set DATABASE_URL=sqlite+aiosqlite:///./gitmind.db  (default)

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
<summary><strong>⚙️ Environment Variables (18)</strong></summary>

**Required**

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `GROQ_API_KEY` | Groq API key — free at [console.groq.com](https://console.groq.com)       |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `https://gitmind-peach.vercel.app`) |

**Database & Storage**

| Variable       | Default                            | Description                                            |
| -------------- | ---------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL` | `sqlite+aiosqlite:///./gitmind.db` | SQLite for dev; `postgresql+asyncpg://...` for prod    |
| `REDIS_URL`    | —                                  | Enables shared rate limiter, session cache, task queue |

**Authentication & Security**

| Variable              | Description                                         |
| --------------------- | --------------------------------------------------- |
| `GITHUB_TOKEN`        | Server-side PAT — raises rate limit to 5,000 req/hr |
| `WS_AUTH_SECRET`      | WebSocket auth — clients must send matching value   |
| `REQUIRE_WS_AUTH`     | When `true`, reject WS without valid auth           |
| `GITMIND_SERVICE_KEY` | CI/service key — bypasses rate limits               |

**Observability**

| Variable                      | Description                               |
| ----------------------------- | ----------------------------------------- |
| `SENTRY_DSN`                  | Sentry DSN for error tracking             |
| `ENVIRONMENT`                 | Environment tag (`production`, `staging`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry OTLP gRPC endpoint          |
| `JSON_LOGS`                   | Enable JSON structured logging            |
| `LOG_LEVEL`                   | Logging level (default: `INFO`)           |

**Tuning**

| Variable                   | Default                 | Description                         |
| -------------------------- | ----------------------- | ----------------------------------- |
| `SIDECAR_URL`              | `http://127.0.0.1:8003` | Solidity parser sidecar endpoint    |
| `TASK_WORKERS`             | `3`                     | Background task queue worker count  |
| `MONITOR_INTERVAL_SECONDS` | `3600`                  | Repo monitoring loop interval       |
| `REPORTER_INTERVAL_SEC`    | `45`                    | Crisis Mode reporter check interval |
| `DEBUG`                    | —                       | Enable health check debug info      |

</details>

---

<details>
<summary><strong>📁 Project Layout</strong></summary>

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
│   ├── chroma_utils.py             ← ChromaDB helpers
│   ├── agents/                     ← 9 LangGraph agent nodes + crisis sub-agents
│   ├── routes/                     ← REST API endpoints
│   ├── ws/                         ← WebSocket handlers
│   ├── models/                     ← SQLAlchemy + Pydantic
│   ├── services/                   ← Auth, cache, rate limiter, task queue, telemetry
│   ├── alembic/                    ← Database migrations
    │   └── tests/                      ← 106 pytest tests
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
        ├── App.js                  ← Root component (useReducer state)
    ├── appReducer.js           ← Typed actions + state transitions
        ├── api.js                  ← All API calls
        ├── components/             ← Tab components + CommandPalette
        └── ...                     ← 70 Jest tests
```

</details>

---

<details>
<summary><strong>🔌 API Endpoints (19)</strong></summary>

**Analysis**

| Endpoint                 | Method | Description                       |
| ------------------------ | ------ | --------------------------------- |
| `/ws/analyze`            | WS     | Streams agent events              |
| `/analyze`               | POST   | Triggers full pipeline            |
| `/analysis/{session_id}` | GET    | Load saved analysis snapshot      |
| `/analysis/previous`     | GET    | Last analysis for a repo          |
| `/analysis/history`      | GET    | Health trend data over time       |
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

| Endpoint            | Method          | Description                |
| ------------------- | --------------- | -------------------------- |
| `/repos/{username}` | GET             | List user repos            |
| `/monitor`          | POST/GET/DELETE | Subscribe/list/unsubscribe |
| `/org-audit`        | POST            | Cross-repo CVE scan        |
| `/webhook/notify`   | POST            | Push results to webhook    |
| `/incident-report`  | POST            | Generate incident report   |

**System**

| Endpoint     | Method | Description           |
| ------------ | ------ | --------------------- |
| `/ws/crisis` | WS     | Crisis Mode role-play |
| `/health`    | GET    | Health check          |
| `/metrics`   | GET    | Prometheus metrics    |

</details>

---

## Rust Native Acceleration

> ⚡ **240 lines of Rust replace 341 lines of Python regex** — zero IPC overhead, compiled via PyO3.

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

## Persistence

| Layer              | Technology         | Purpose                                        |
| ------------------ | ------------------ | ---------------------------------------------- |
| Analysis snapshots | SQLAlchemy + async | Session state, SHA cache, analysis results     |
| SQLite (default)   | `aiosqlite`        | Zero-config local dev                          |
| PostgreSQL (prod)  | `asyncpg`          | Production — one env var selects backend       |
| Redis (optional)   | `redis-py`         | Shared rate limiter, session cache, task queue |
| ChromaDB           | embedded           | Vector store for RAG chat                      |
| LLM cache          | `diskcache`        | Caches Groq API responses                      |

---

## Rate Limiting

| Tier                 | Rate        | Applied to                 |
| -------------------- | ----------- | -------------------------- |
| 🔑 **Service key**   | Unlimited   | `X-Service-Key` header     |
| 👤 **Authenticated** | 30 req/min  | `X-GH-Token` header        |
| 🌐 **Anonymous**     | 3 req/min   | No auth                    |
| 🔍 **Analyze**       | 1 req/60s   | `POST /analyze` (per repo) |
| 📊 **PR impact**     | 5 req/10min | `POST /pr-impact`          |
| 🩹 **Fix**           | 5 req/min   | `POST /fix`                |

Rate-limited requests return HTTP 429 with `Retry-After` header.

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
| **In-UI PAT** (recommended) | Private repos, auto-fix PRs      | Enter via `⌘K` command bar — encrypted `localStorage` (AES-GCM, 1h TTL) |
| **Server `GITHUB_TOKEN`**   | Rate limit boost (60 → 5,000/hr) | Set in `backend/.env`                                                   |
| **Service key**             | CI/CD — bypasses rate limits     | `GITMIND_SERVICE_KEY` → `X-Service-Key` header                          |

> Git operations use `GIT_ASKPASS` helper — token never in URLs or logs.

---

## CI/CD

| Workflow               | Trigger              | What it does                                                     |
| ---------------------- | -------------------- | ---------------------------------------------------------------- |
| `ci.yml`               | Push/PR to `main`    | Backend tests + Rust build, frontend tests + build, deploy to HF |
| `gitmind-analysis.yml` | PR open/sync         | Auto-comment with health score + top findings                    |
| `gitmind-monitor.yml`  | Weekly (Mon 8am UTC) | Re-analyze, health delta, Slack alert + GitHub issue             |

---

## Testing

```
✅ Backend:  106 tests passing (pytest-asyncio)
✅ Frontend:  70 tests passing (Jest + React Testing Library)
✅ Rust:      clippy + rustfmt clean
```

```bash
# Backend
cd backend && python -m pytest tests/ -v

# Frontend
cd frontend && npx react-scripts test --watchAll=false
```

---

## Deployment

| Platform                   | What                   | URL                                                                                     |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| 🟢 **Hugging Face Spaces** | Backend (Docker)       | [ak001z-gitmind-backend.hf.space](https://huggingface.co/spaces/Ak001z/gitmind-backend) |
| 🔵 **Vercel**              | Frontend (auto-deploy) | [gitmind-peach.vercel.app](https://gitmind-peach.vercel.app)                            |
| 🐳 **Docker Compose**      | Full stack (self-host) | `docker compose up -d --build`                                                          |
| ☁️ **Any Python host**     | Backend                | Render, Fly.io, EC2, etc.                                                               |

### Quick Deploy

```bash
# Self-host full stack
docker compose up -d --build

# Deploy to HF (manual)
./scripts/deploy-hf.sh

# Frontend — push to main → Vercel auto-deploys
```

---

## Keyboard Shortcuts

| Shortcut          | Action                           |
| ----------------- | -------------------------------- |
| `⌘/Ctrl + K`      | Command palette                  |
| `⌘/Ctrl + R`      | Re-analyze                       |
| `⌘/Ctrl + 1-9, 0` | Switch tabs                      |
| `?`               | Toggle shortcut help             |
| `+` / `-` / `0`   | Zoom in/out/reset (Architecture) |
| `F`               | Fit diagram to screen            |

---

## Contributing

Contributions welcome! Fork the repo, create a feature branch, and open a PR. CI runs automatically on all PRs.

---

## License

MIT
