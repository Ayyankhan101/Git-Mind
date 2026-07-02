# GitMind

Multi-agent repository intelligence platform. Enter a GitHub username (and optionally a PAT for private repos), pick a repo — 9 agents run in parallel and produce an architecture diagram, API docs, security audit, CVE scan, git commit audit, Solidity/Web3 audit, multi-language code audit, RAG chat, and a shareable report. Health score is computed post-pipeline from agent outputs. An optional Crisis Mode role-plays a security incident with CEO / Legal / Engineering / Reporter agents.

**Stack:** FastAPI · LangGraph · Groq (llama-3.3-70b-versatile) · ChromaDB · PostgreSQL / SQLAlchemy · React · Mermaid · semgrep · OSV.dev · diskcache · Redis (optional) · Sentry (optional) · Rust (PyO3 native module + solang-parser sidecar)

---

## Features

| Feature                    | Description                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture diagram**   | Mermaid graph of component relationships using 24K-token context window; pan/zoom/fullscreen with keyboard shortcuts                                                                                                          |
| **API doc agent**          | Extracts every HTTP endpoint (method, route, description, parameters, auth_required) across FastAPI, Flask, Express, Django, Rails, Spring, NestJS, Gin, Echo, and more                                                       |
| **Security auditor**       | semgrep SAST scan triaged by llama-3.3-70b; findings include exploit scenario, remediation step, and CWE identifier; ranked Critical → Low                                                                                    |
| **CVE scanner**            | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — supports PyPI, npm (package-lock/yarn/pnpm), Cargo, Go (go.sum + go.mod), Ruby, and PHP (composer.lock). Lockfile parsing accelerated by Rust native module. |
| **Git audit**              | Commit log analysis (100 commits): message quality, secret detection, sensitive file tracker. Secret/route scanning accelerated by Rust native module.                                                                        |
| **Solidity/Web3 audit**    | Parses Solidity `.sol` files via Rust sidecar (solang-parser), then LLM-triage for vulnerabilities (reentrancy, access control, oracle manipulation, etc.)                                                                    |
| **Code audit**             | Per-language static analysis (pylint, eslint, go vet, clippy) with LLM triage fallback for Python, JS/TS, Go, Rust, and Java                                                                                                  |
| **Auto-fix patches**       | Click "Generate Fix" on any finding → unified diff patch from LLM + RAG context; click "Open PR" on any finding → auto-commit and open a GitHub PR with the fix (requires PAT with `repo` scope)                              |
| **PR review**              | Paste any GitHub PR URL → structured review with file:line issues and verdict; results cached by PR head SHA                                                                                                                  |
| **Predictive PR impact**   | After analyzing a repo, enter a PR URL → LLM merge-risk prediction (low/medium/high/critical), plain-English narrative, affected areas, breaking changes, health score delta, new/fixed findings and CVEs vs base             |
| **Org-wide CVE dashboard** | Scan all loaded repos for CVEs via GitHub API — cross-repo shared vulnerability detection                                                                                                                                     |
| **Incident close loop**    | After Crisis Mode ends, generate a full incident report (timeline, impact, stakeholder statement, remediation checklist, lessons learned)                                                                                     |
| **RAG chat**               | Ask anything about the codebase; ChromaDB (8 context chunks) + streaming SSE responses                                                                                                                                        |
| **Crisis Mode**            | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if the team is too slow                                                                                                           |
| **Shareable links**        | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL                                                                                                                                                       |
| **Export report**          | Download full analysis as Markdown                                                                                                                                                                                            |
| **Private repo access**    | Enter a GitHub PAT in the command bar to load and analyze private repositories                                                                                                                                                |
| **Repository monitoring**  | Subscribe repos via `POST /monitor` — background loop fetches latest shas, triggers re-analysis on change (configurable interval)                                                                                             |
| **Webhook notifications**  | `POST /webhook/notify` — pushes analysis results to external URLs for CI/CD integration                                                                                                                                       |
| **CI/CD integration**      | 3 GitHub Actions workflows: CI (test+build+deploy), PR analysis (auto-comment), weekly monitoring (Slack alerts + GitHub issues)                                                                                              |

---

## Quickstart — Docker (recommended)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...

# Full stack with PostgreSQL + Solidity sidecar
docker compose up -d --build
# Frontend: http://localhost:80
# Backend:  http://localhost:8002/health
```

### Dev mode (hot-reload)

```bash
docker compose -f docker-compose.dev.yml up -d --build
# Frontend: http://localhost:3002
# Backend:  http://localhost:8002/health
```

---

## Quickstart — Bare-metal (no Docker)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...
# Set DATABASE_URL=sqlite+aiosqlite:///./gitmind.db  (default)

./start.sh          # starts backend (:8002) + frontend (:3000)
./stop.sh           # stops both
./stop.sh restart   # restart both
```

Requires the Rust gitmind_core module:

```bash
cd rust-gitmind && pip install maturin && maturin build --release && pip install target/wheels/gitmind_core*.whl
```

For PostgreSQL locally:

```bash
# Start a local PG and set:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/gitmind
```

Logs are written to `logs/backend.log` and `logs/frontend.log`.

---

## Environment variables

| Variable                      | Required | Default                            | Description                                                                                            |
| ----------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GROQ_API_KEY`                | Yes      | —                                  | Groq API key — free at [console.groq.com](https://console.groq.com)                                    |
| `DATABASE_URL`                | No       | `sqlite+aiosqlite:///./gitmind.db` | SQLite for local dev; PostgreSQL+asyncpg for production                                                |
| `GITHUB_TOKEN`                | No       | —                                  | Server-side GitHub PAT — raises rate limit to 5 000 req/hr for all users                               |
| `REDIS_URL`                   | No       | —                                  | Redis URL — enables Redis-backed rate limiter, session cache, and task queue (falls back to in-memory) |
| `CORS_ORIGINS`                | No       | `http://localhost:3000,…`          | Comma-separated allowed origins                                                                        |
| `WS_AUTH_SECRET`              | No       | —                                  | If set, WebSocket clients must send matching `ws_auth_secret` in initial payload                       |
| `REQUIRE_WS_AUTH`             | No       | —                                  | If `true`, WebSocket connections are rejected without valid `WS_AUTH_SECRET`                           |
| `SENTRY_DSN`                  | No       | —                                  | Sentry DSN for error tracking (backend + frontend)                                                     |
| `ENVIRONMENT`                 | No       | —                                  | Environment tag for Sentry (e.g. `production`, `staging`)                                              |
| `GITMIND_SERVICE_KEY`         | No       | —                                  | CI/service authentication key — bypasses rate limits, required for automated CI workflows              |
| `SIDECAR_URL`                 | No       | `http://127.0.0.1:8003`            | Solidity parser sidecar endpoint                                                                       |
| `TASK_WORKERS`                | No       | `3`                                | Background task queue worker count                                                                     |
| `MONITOR_INTERVAL_SECONDS`    | No       | `3600`                             | Repository monitoring loop interval                                                                    |
| `REPORTER_INTERVAL_SEC`       | No       | `45`                               | Crisis Mode reporter check interval (seconds)                                                          |
| `JSON_LOGS`                   | No       | —                                  | Enable JSON-formatted structured logging                                                               |
| `LOG_LEVEL`                   | No       | `INFO`                             | Logging level (DEBUG, INFO, WARNING, ERROR)                                                            |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | —                                  | OpenTelemetry OTLP gRPC endpoint for distributed tracing                                               |
| `DEBUG`                       | No       | —                                  | Enable health check debug info                                                                         |

---

## Project layout

```
Git-Mind/
├── docker-compose.yml              ← Production compose (PostgreSQL + app + solidity-parser + nginx)
├── docker-compose.dev.yml          ← Dev compose (hot-reload + PostgreSQL)
├── Dockerfile                      ← Multi-stage: rust-builder → backend-builder → frontend-builder → production runner
├── nginx.conf
├── start.sh                        ← Bare-metal launcher
├── stop.sh                         ← Bare-metal stop/restart
│
├── backend/
│   ├── main.py                     ← FastAPI app (lifespan, CORS, routers, /health, /metrics)
│   ├── orchestrator.py             ← LangGraph analysis + crisis graphs (parallel 9-agent DAG)
│   ├── state.py                    ← RepoState TypedDict (solidity_audit, code_audit, events)
│   ├── chroma_utils.py             ← ChromaDB helpers (writable-dir fallback, collection pruning)
│   ├── llm_cache.py                ← diskcache wrapper with retry
│   ├── Dockerfile                  ← HF Spaces Dockerfile (multi-stage with rust-builder)
│   ├── .env.example
│   ├── requirements.txt
│   ├── pytest.ini
│   │
│   ├── agents/                     ← 9 LangGraph agent nodes + crisis sub-agents
│   │   ├── scanner.py              ← Clone + index repository
│   │   ├── architecture.py         ← Mermaid dependency diagram
│   │   ├── api_doc.py              ← HTTP endpoint extraction (route scanning in Rust)
│   │   ├── security.py             ← semgrep SAST + LLM triage
│   │   ├── cve_scanner.py          ← OSV.dev lookup (12 lockfile parsers in Rust)
│   │   ├── git_audit.py            ← Commit log + secret detection (secrets/sensitive-files in Rust)
│   │   ├── rag_setup.py            ← ChromaDB ingestion
│   │   ├── health.py               ← Health score (post-pipeline; comment-ratio in Rust)
│   │   ├── solidity_agent.py       ← Solidity audit (Rust sidecar parsing + LLM triage)
│   │   ├── language_audit.py       ← Multi-language code audit (pylint/eslint/go vet/clippy + LLM)
│   │   ├── chat.py                 ← RAG chat (streaming SSE)
│   │   ├── pr_review.py            ← PR review from URL
│   │   ├── impact.py               ← PR merge-risk prediction
│   │   ├── blame.py                ← Git blame enrichment for findings
│   │   └── crisis/                 ← Crisis Mode sub-agents
│   │       ├── _base.py            ← Agent factory (make_crisis_agent)
│   │       ├── router.py           ← Topic router
│   │       ├── reporter.py         ← Escalation reporter
│   │       ├── ceo.py, legal.py, engineer.py
│   │
│   ├── routes/                     ← REST API endpoints
│   │   ├── analyze.py              ← POST /analyze — triggers pipeline
│   │   ├── analysis.py             ← GET /analysis/{id}, GET /analysis/previous
│   │   ├── chat.py                 ← POST /chat, POST /chat/stream
│   │   ├── fix.py                  ← POST /fix, POST /fix/pr (auto-PR)
│   │   ├── pr.py                   ← POST /pr-review, /pr-impact, GET /pr-list/{owner}/{repo}
│   │   ├── repos.py                ← GET /repos/{username}
│   │   ├── org.py                  ← POST /org-audit
│   │   ├── monitor.py              ← POST /monitor, GET /monitor, DELETE /monitor
│   │   ├── webhook.py              ← POST /webhook/notify
│   │   └── incident.py             ← POST /incident-report
│   │
│   ├── ws/
│   │   ├── analyze.py              ← /ws/analyze — streams 9-agent events
│   │   └── crisis.py               ← /ws/crisis — Crisis Mode role-play
│   │
│   ├── models/
│   │   ├── db.py                   ← SQLAlchemy models (Analysis, ShaIndex, MonitoredRepo)
│   │   └── requests.py             ← Pydantic models (12 request types)
│   │
│   ├── services/                   ← Shared infrastructure (10 modules)
│   │   ├── auth.py                 ← get_gh_token, require_gh_token, require_gh_token_or_service_key,
│   │   │                             get_service_key, AuthMiddleware
│   │   ├── cache.py                ← Redis connection manager (falls back to in-memory)
│   │   ├── session.py              ← In-memory LRU session cache + DB persist/restore
│   │   ├── sha_cache.py            ← SHA-based snapshot dedup (DB-backed)
│   │   ├── database.py             ← Async engine, CRUD helpers
│   │   ├── rate_limiter.py         ← 6-tier sliding-window rate limiter (Redis/in-memory)
│   │   ├── rate_limit_response.py  ← 429 response builder with Retry-After header
│   │   ├── task_queue.py           ← asyncio.Queue background worker with UUID task registry
│   │   ├── telemetry.py            ← structlog, Prometheus middleware, OTel tracing, Sentry init
│   │   └── correlation.py          ← X-Request-ID injection middleware
│   │
│   ├── alembic/                    ← Database migrations
│   ├── tests/                      ← pytest suite (106 tests, async)
│   │   ├── test_routes.py          ← REST endpoint integration
│   │   ├── test_new_routes.py      ← Analyze, webhook, monitor endpoints
│   │   ├── test_rate_limiter.py    ← Sliding-window rate limiter, tiered limits
│   │   ├── test_session.py         ← LRU cache + DB persist/restore
│   │   ├── test_database.py        ← Analysis snapshot round-trip
│   │   ├── test_language_audit.py  ← Multi-language code audit agent
│   │   ├── test_orchestrator.py    ← LangGraph node wiring
│   │   ├── test_ws_analyze.py      ← WebSocket analyze handler
│   │   ├── test_models.py          ← Pydantic request model validation
│   │   └── test_sha_cache.py       ← SHA-index dedup, remote SHA fetch
│   │
│   └── services/
│       └── cache.py                ← Redis init, close, get_redis, is_fallback
│
├── rust-gitmind/                   ← PyO3 native module (gitmind_core)
│   ├── Cargo.toml                  ← pyo3, regex, serde_json deps
│   ├── pyproject.toml              ← maturin build config
│   └── src/
│       ├── lib.rs                  ← Module entry point, registers all functions
│       ├── dep_parsers.rs          ← 12 lockfile parsers (requirements.txt, package-lock.json,
│       │                             Cargo.lock, go.sum, go.mod, composer.lock, yarn.lock,
│       │                             pnpm-lock.yaml, poetry.lock, Pipfile.lock, Gemfile.lock)
│       └── file_scanner.rs         ← Secret pattern scanning (RegexSet), sensitive file detection,
│                                      route pattern detection, comment ratio scoring
│
├── rust-sidecar/                   ← Solidity parser HTTP sidecar
│   ├── Cargo.toml                  ← solang-parser, axum, serde, tokio
│   ├── Dockerfile                  ← Multi-stage Rust build
│   └── src/
│       ├── main.rs                 ← Axum server (POST /parse, GET /health), port 8003
│       ├── parser.rs               ← solang-parser → AST extraction
│       └── models.rs               ← ParseResponse, ContractInfo, FunctionInfo, etc.
│
├── scripts/
│   ├── ci-analyze.sh               ← Shared CI trigger/poll/fetch script
│   └── deploy-hf.sh                ← rsync + git push deploy to HF Spaces
│
├── .github/workflows/
│   ├── ci.yml                      ← CI: backend tests (with Rust build), frontend tests, deploy to HF
│   ├── gitmind-analysis.yml        ← PR analysis: auto-comment on PRs
│   └── gitmind-monitor.yml         ← Weekly monitoring: Slack alerts + GitHub issues
│
└── frontend/
    ├── package.json
    ├── vercel.json                  ← SPA rewrite rules for Vercel
    └── src/
        ├── App.js                  ← Root: WS analysis, tabs, keyboard shortcuts, theme
        ├── api.js                  ← Shared fetch helper + all API calls
        ├── constants.js            ← LANG_COLOR map
        ├── tokenManager.js         ← AES-GCM encrypted localStorage for GitHub PAT
        ├── setupTests.js           ← Jest polyfills
        └── components/             ← Tab/page components
            ├── ArchitectureTab.jsx
            ├── ApiDocTab.jsx
            ├── SecurityTab.jsx
            ├── CveTab.jsx
            ├── GitAuditTab.jsx
            ├── SolidityTab.jsx     ← Solidity/Web3 audit tab (contracts + findings + fix)
            ├── CodeAuditTab.jsx    ← Per-language code audit tab (findings + fix)
            ├── HealthTab.jsx
            ├── ChatTab.jsx
            ├── CrisisTab.jsx
            ├── ImpactTab.jsx
            ├── ReportTab.jsx
            ├── CommandPalette.jsx  ← ⌘/Ctrl+K palette
            ├── TokenInput.jsx      ← PAT entry (lock icon)
            └── ErrorBoundary.jsx   ← Sentry-connected error boundary
```

---

## API endpoints

| Endpoint                  | Method | Description                                                                                                        |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `/ws/analyze`             | WS     | Streams agent events → diagram, api_docs, findings, CVEs, git_audit, solidity_audit, code_audit, health            |
| `/analyze`                | POST   | `{repo_url, gh_token?}` — triggers full pipeline, returns `{session_id}`                                           |
| `/analysis/{session_id}`  | GET    | Load a saved analysis snapshot (share links)                                                                       |
| `/analysis/previous`      | GET    | `?repo_url=...` — shows last analysis for a repo (SHA-cache hit)                                                   |
| `/chat`                   | POST   | `{session_id, question}` → `{answer}`                                                                              |
| `/chat/stream`            | POST   | SSE streaming chat — yields `data: {"token": "..."}`                                                               |
| `/fix`                    | POST   | `{session_id, finding}` → unified diff patch                                                                       |
| `/fix/pr`                 | POST   | `{session_id, finding}` — requires `X-GH-Token` (PAT with `repo` scope); creates GitHub PR with fix (any severity) |
| `/pr-review`              | POST   | `{pr_url}` — pass `X-GH-Token` for private repos                                                                   |
| `/pr-impact`              | POST   | `{pr_url, session_id}` → `{"task_id": "..."}`; poll `GET /task/{task_id}`                                          |
| `/task/{task_id}`         | GET    | Poll background task: `{id, status, result?, error?}`                                                              |
| `/org-audit`              | POST   | `{repos: [urls]}` — cross-repo CVE scan                                                                            |
| `/pr-list/{owner}/{repo}` | GET    | List open PRs for a repo                                                                                           |
| `/incident-report`        | POST   | `{session_id, ...}` → 6-section incident report                                                                    |
| `/repos/{username}`       | GET    | List repos — pass `X-GH-Token` for private repos                                                                   |
| `/monitor`                | POST   | `{repo_url}` — subscribe repo to monitoring                                                                        |
| `/monitor`                | GET    | List monitored repos with latest health deltas                                                                     |
| `/monitor`                | DELETE | `{repo_url}` — unsubscribe                                                                                         |
| `/webhook/notify`         | POST   | `{session_id, webhook_url}` — push results to external URL                                                         |
| `/ws/crisis`              | WS     | Crisis Mode — streams CEO/Legal/Engineering role-play                                                              |
| `/health`                 | GET    | `{status, sessions_active, checks, debug?}`                                                                        |
| `/metrics`                | GET    | Prometheus metrics (text/plain format)                                                                             |

---

## LangGraph pipeline

```
START
  └─► scanner (clone + index)
        ├─► architecture   (Mermaid diagram)
        ├─► api_docs       (endpoint extraction — Rust route scanning)
        ├─► security       (semgrep SAST + LLM triage)
        ├─► cve_scanner    (OSV.dev lookup — Rust lockfile parsing)
        ├─► git_audit      (commit log + Rust secret scanning)
        ├─► rag_setup      (ChromaDB ingestion)
        ├─► solidity       (solang-parser sidecar + LLM triage)
        ├─► code_audit     (pylint/eslint/go vet/clippy + LLM triage)
        └─► END

Post-pipeline (ws/analyze.py):
  └─► blame enrichment → health score (security, docs, API, deps, code quality)
```

All 8 post-scanner nodes run in parallel. Each is fully error-isolated — a failure returns safe defaults and the rest of the pipeline continues. Health score is computed after the graph completes.

---

## Rust native acceleration

Two Rust components ship as part of the platform:

### gitmind_core (PyO3 native module)

Replaces 341 lines of Python regex logic with 240 lines of compiled Rust. Ships as a `.so` via maturin — no sidecar process, no IPC overhead.

| Function                 | Replaces                                    | Speed-up                        |
| ------------------------ | ------------------------------------------- | ------------------------------- |
| `parse_dependencies()`   | 13 lockfile parsers in `cve_scanner.py`     | Single-pass `RegexSet` matching |
| `scan_secrets()`         | Loop of 11 regex patterns in `git_audit.py` | O(1) vs O(n) per file           |
| `scan_sensitive_files()` | File path pattern matching                  | Compiled regex                  |
| `scan_route_files()`     | Route detection in `api_doc.py`             | Single-pass                     |
| `compute_docs_score()`   | Comment/docstring ratio in `health.py`      | RegexSet batch                  |

### rust-sidecar (Solidity parser)

Standalone Axum HTTP server (port 8003) using `solang-parser` for Solidity AST extraction. Runs as a separate container in Docker Compose. `solidity_agent.py` sends `.sol` source to `POST /parse` and LLM-triages the resulting AST.

---

## Persistence

| Layer              | Technology         | Purpose                                                                      |
| ------------------ | ------------------ | ---------------------------------------------------------------------------- |
| Analysis snapshots | SQLAlchemy + async | Session state, SHA cache, analysis results                                   |
| SQLite (default)   | `aiosqlite`        | Zero-config local dev — no DB server needed                                  |
| PostgreSQL (prod)  | `asyncpg`          | Production — one `DATABASE_URL` env var selects backend                      |
| Redis (optional)   | `redis-py`         | Shared rate-limiter state, session cache, task queue persistence             |
| ChromaDB           | embedded           | Vector store for RAG chat (8 context chunks, ONNX model pre-baked in Docker) |
| LLM cache          | `diskcache`        | Caches Groq API responses keyed by prompt hash                               |

Database schema is auto-created on startup via `models/db.py`. Alembic migrations available for schema changes.

---

## Background task queue

Heavy operations (PR impact prediction) run in a background `asyncio.Task` consuming an `asyncio.Queue`:

1. **Submit** → `POST /pr-impact` returns `{"task_id": "..."}` after validation
2. **Poll** → `GET /task/{task_id}` returns `{id, status, result?, error?}`
   - Status: `submitted` → `running` → `completed` / `failed`
3. **TTL** → Completed tasks expire after 10 minutes

Tracked via Prometheus counters: `tasks_submitted_total`, `tasks_completed_total`.

---

## Rate limiting

All endpoints except `/health` and `/metrics` enforce sliding-window rate limits. Backend is Redis-backed with in-memory fallback when `REDIS_URL` is not set.

| Tier              | Rate         | Applied to                                                                |
| ----------------- | ------------ | ------------------------------------------------------------------------- |
| **Service key**   | Unrestricted | Requests with valid `X-Service-Key` header matching `GITMIND_SERVICE_KEY` |
| **Authenticated** | 30 req/min   | Requests with valid `X-GH-Token` header                                   |
| **Anonymous**     | 3 req/min    | Requests without any auth                                                 |
| **Analyze**       | 1 req/60s    | `POST /analyze` (per repo)                                                |
| **PR impact**     | 5 req/10min  | `POST /pr-impact`                                                         |
| **Fix**           | 5 req/min    | `POST /fix`                                                               |

Rate-limited requests return HTTP 429 with `Retry-After` header and `X-RateLimit-*` response headers.

---

## Telemetry

| Tool                | Purpose                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `structlog`         | Structured JSON logging across all modules                                                 |
| `prometheus_client` | `/metrics` — custom middleware tracks request count, latency, in-flight, and task counters |
| OpenTelemetry SDK   | Manual setup (avoids chromadb version conflicts) — traces to `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Sentry              | Optional error tracking (backend + frontend `ErrorBoundary`); init via `SENTRY_DSN`        |
| Correlation IDs     | Every request gets `X-Request-ID` header (CorrelationMiddleware) — traced through logs     |

Why custom Prometheus middleware instead of `prometheus-fastapi-instrumentator`? That library crashes on `_IncludedRouter` objects from `app.include_router()`. The custom middleware is simpler and more reliable.

---

## Authentication

### REST API — `X-GH-Token` header

- Centralized via `services/auth.py` — `get_gh_token(request)` reads the header with `GITHUB_TOKEN` env fallback
- Every route uses the helper instead of inline header parsing
- Token is never stored in cookies or request bodies

### Service key — `X-Service-Key` header

- Used by CI/CD workflows — set `GITMIND_SERVICE_KEY` on both sides
- `require_gh_token_or_service_key()` accepts either `X-GH-Token` or `X-Service-Key`
- Service key bypasses rate limits entirely

### WebSocket — `WS_AUTH_SECRET` / `REQUIRE_WS_AUTH`

- Both env vars optional (disabled by default)
- When `REQUIRE_WS_AUTH=true`, WS clients must send `ws_auth_secret` matching `WS_AUTH_SECRET`
- Missing/mismatched secret → close frame code 1008 (policy violation)

### User-level PAT (frontend)

- Enter in the token field (lock icon in command bar)
- **Stored in-memory + AES-GCM encrypted localStorage** via `tokenManager.js` (1h TTL)
- Cleared on browser close or TTL expiry
- Passed as `X-GH-Token` in every API call
- Scopes: `repo` for private repo access and auto-fix PRs

### Git clone tokens

- Git operations use `GIT_ASKPASS` helper script (not URL-embedding) — avoids token leakage in logs

---

## GitHub Actions CI/CD

| Workflow               | Trigger                       | What it does                                                                                                                        |
| ---------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`               | Push/PR to `main`             | Backend tests (Python 3.11 + Rust maturin build), frontend tests (Node 22 + build), deploy to HF Spaces                             |
| `gitmind-analysis.yml` | PR open/sync/reopen           | Runs analysis via `ci-analyze.sh`, posts/updates PR comment with health score, top 15 security findings, top 10 CVEs                |
| `gitmind-monitor.yml`  | Weekly (Mon 8am UTC) / manual | Fetches previous analysis, re-analyzes, compares health score delta, sends Slack alert, creates GitHub issue on significant changes |

### CI deploy to Hugging Face Spaces

1. Backend tests pass (Rust `gitmind_core` built via maturin)
2. Frontend tests pass (React build)
3. `rust-gitmind/` source copied into `backend/` directory
4. `backend/` uploaded to `Ak001z/gitmind-backend` Space via `huggingface_hub` Python API
5. HF Space Docker build compiles Rust module and starts the service

---

## Testing

### Backend (pytest — 106 tests)

```bash
cd backend
python -m pytest tests/ -v
```

Uses `pytest-asyncio` with `asyncio_mode = auto`. Tests use isolated temp SQLite database with patched `services.database.*`.

| Test file                      | Coverage                                    |
| ------------------------------ | ------------------------------------------- |
| `tests/test_routes.py`         | REST endpoint integration (mock DB)         |
| `tests/test_new_routes.py`     | Analyze, webhook, monitor endpoints         |
| `tests/test_rate_limiter.py`   | Sliding-window rate limiter, tiered limits  |
| `tests/test_session.py`        | LRU cache + DB persist/restore              |
| `tests/test_database.py`       | Analysis snapshot round-trip (audit fields) |
| `tests/test_language_audit.py` | Multi-language code audit agent             |
| `tests/test_orchestrator.py`   | LangGraph node wiring                       |
| `tests/test_ws_analyze.py`     | WebSocket analyze handler                   |
| `tests/test_models.py`         | Pydantic request model validation           |
| `tests/test_sha_cache.py`      | SHA-index dedup, remote SHA fetch           |

### Frontend (Jest — 49 tests)

```bash
cd frontend
npx react-scripts test --watchAll=false
```

| Test file                               | Coverage                 |
| --------------------------------------- | ------------------------ |
| `src/constants.test.js`                 | LANG_COLOR hex values    |
| `src/api.test.js`                       | Error shape parsing      |
| `src/components/ErrorBoundary.test.jsx` | Crash isolation          |
| `src/App.test.js`                       | Root component rendering |

---

## GitHub Authentication

**In-UI token (per user, recommended)**

Enter a Personal Access Token in the token field (lock icon in the command bar). Stored in memory + encrypted `localStorage` (AES-GCM via `tokenManager.js`, 1h TTL). Sent to the backend as the `X-GH-Token` request header — never stored in cookies or request bodies.

- Create at: `github.com/settings/tokens/new` → select **`repo`** scope
- Enables: loading private repos, analyzing private repos, PR review of private repos, auto-fix PRs (all severity levels)
- Cleared on browser close or TTL expiry

**Server-side `GITHUB_TOKEN` env var**

Set in `backend/.env`. Applies to all users — raises GitHub API rate limit (60 → 5 000 req/hr). Does not grant access to individual users' private repos.

**Service key for CI**

Set `GITMIND_SERVICE_KEY` — passed as `X-Service-Key` header from CI workflows. Bypasses rate limits.

---

## Keyboard shortcuts

| Shortcut     | Action                                   |
| ------------ | ---------------------------------------- |
| `⌘/Ctrl + K` | Open command palette                     |
| `⌘/Ctrl + R` | Re-analyze current repo                  |
| `⌘/Ctrl + 1` | Summary tab                              |
| `⌘/Ctrl + 2` | Architecture tab                         |
| `⌘/Ctrl + 3` | API Docs tab                             |
| `⌘/Ctrl + 4` | Security tab                             |
| `⌘/Ctrl + 5` | CVE tab                                  |
| `⌘/Ctrl + 6` | Git Audit tab                            |
| `⌘/Ctrl + 7` | Solidity tab                             |
| `⌘/Ctrl + 8` | Code Audit tab                           |
| `⌘/Ctrl + 9` | PR Review tab                            |
| `⌘/Ctrl + 0` | Chat tab                                 |
| `?`          | Toggle keyboard shortcut help            |
| `+` / `-`    | Zoom in / out (Architecture tab)         |
| `0`          | Reset zoom (Architecture tab)            |
| `F`          | Fit diagram to screen (Architecture tab) |

---

## Deployment

### Docker Compose (recommended for self-host)

```bash
docker compose up -d --build
```

Includes PostgreSQL, Solidity parser sidecar (port 8003), automated health checks. Frontend served via nginx on port 80.

### Hugging Face Spaces (backend only)

The backend is deployed to [Ak001z/gitmind-backend](https://huggingface.co/spaces/Ak001z/gitmind-backend). Docker-based Space (sdk: docker), multi-stage build with Rust compiler.

```bash
# Manual deploy:
./scripts/deploy-hf.sh

# CI auto-deploy:
# Push to main → GitHub Actions builds → uploads backend/ to HF Space
```

Required secrets: `GROQ_API_KEY`, `CORS_ORIGINS`, `HF_TOKEN`.  
Public endpoint: `https://ak001z-gitmind-backend.hf.space`

### Vercel (frontend)

The React frontend auto-deploys from git push to `main`.  
Public URL: `https://gitmind-peach.vercel.app`

`frontend/vercel.json` handles SPA routing via rewrites.  
Environment: `REACT_APP_API_BASE=https://ak001z-gitmind-backend.hf.space`

### Backend — any Python host (Render, Fly.io, EC2)

```bash
pip install -r requirements.txt
# Build and install gitmind_core:
cd ../rust-gitmind && pip install maturin && maturin build --release && pip install target/wheels/gitmind_core*.whl
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `GROQ_API_KEY` and optionally `GITHUB_TOKEN`, `WS_AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `SENTRY_DSN`.

### Frontend — Cloudflare Pages (or any static host)

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `build`
- Env var: `REACT_APP_API_BASE=https://your-backend-url`

`frontend/public/_redirects` handles SPA routing on Cloudflare Pages.
