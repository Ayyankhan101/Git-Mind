# GitMind

Multi-agent repository intelligence platform. Enter a GitHub username (and optionally a PAT for private repos), pick a repo — 7 agents run in parallel and produce an architecture diagram, API docs, security audit, CVE scan, git commit audit, RAG chat, and a shareable report. An optional Crisis Mode role-plays a security incident with CEO / Legal / Engineering / Reporter agents.

**Stack:** FastAPI · LangGraph · Groq (llama-3.3-70b-versatile) · ChromaDB · PostgreSQL / SQLAlchemy · React · Mermaid · semgrep · OSV.dev · diskcache

---

## Features

| Feature | Description |
|---|---|
| **Architecture diagram** | Mermaid graph of component relationships using 24K-token context window; pan/zoom/fullscreen with keyboard shortcuts |
| **API doc agent** | Extracts every HTTP endpoint (method, route, description, parameters, auth_required) across FastAPI, Flask, Express, Django, Rails, Spring, NestJS, Gin, Echo, and more |
| **Security auditor** | semgrep SAST scan triaged by llama-3.3-70b; findings include exploit scenario, remediation step, and CWE identifier; ranked Critical → Low |
| **CVE scanner** | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — supports PyPI, npm (package-lock/yarn/pnpm), Cargo, Go (go.sum + go.mod), Ruby, and PHP (composer.lock) |
| **Git audit** | Commit log analysis (100 commits): message quality, hardcoded secret detection, sensitive file tracker |
| **Auto-fix patches** | Click "Generate Fix" on any finding → unified diff patch from LLM + RAG context |
| **PR review** | Paste any GitHub PR URL → structured review with file:line issues and verdict; results cached by PR head SHA |
| **Predictive PR impact** | After analyzing a repo, enter a PR URL → LLM merge-risk prediction (low/medium/high/critical), plain-English narrative, affected areas, breaking changes, health score delta, new/fixed findings and CVEs vs base |
| **Org-wide CVE dashboard** | Scan all loaded repos for CVEs via GitHub API — cross-repo shared vulnerability detection |
| **Incident close loop** | After Crisis Mode ends, generate a full incident report (timeline, impact, stakeholder statement, remediation checklist, lessons learned) |
| **RAG chat** | Ask anything about the codebase; ChromaDB (8 context chunks) + streaming SSE responses |
| **Crisis Mode** | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if the team is too slow |
| **Shareable links** | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL |
| **Export report** | Download full analysis as Markdown |
| **Private repo access** | Enter a GitHub PAT in the command bar to load and analyze private repositories |

---

## Quickstart — Docker (recommended)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...

docker compose up -d --build        # PostgreSQL + app + nginx
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

For PostgreSQL locally:
```bash
# Start a local PG and set:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/gitmind
```

Logs are written to `logs/backend.log` and `logs/frontend.log`.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | — | Groq API key — free at [console.groq.com](https://console.groq.com) |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./gitmind.db` | SQLite for local dev; PostgreSQL+asyncpg for production |
| `GITHUB_TOKEN` | No | — | Server-side GitHub PAT — raises rate limit to 5 000 req/hr for all users |
| `WS_AUTH_SECRET` | No | — | If set, WebSocket clients must send a matching `ws_auth_secret` in their initial payload |
| `CORS_ORIGINS` | No | `http://localhost:3000,…` | Comma-separated allowed origins |
| `REACT_APP_API_BASE` | No | auto-derived | Backend base URL for the frontend |

---

## Project layout

```
Git-Mind/
├── docker-compose.yml          ← Production compose (PostgreSQL + app + nginx)
├── docker-compose.dev.yml      ← Dev compose (hot-reload + PostgreSQL)
├── Dockerfile                  ← Multi-stage: backend-builder → frontend-builder → production runner
├── nginx.conf
├── start.sh                    ← Bare-metal launcher
├── stop.sh                     ← Bare-metal stop/restart
├── backend/
│   ├── main.py                 ← FastAPI app (lifespan, CORS, telemetry, routers, /health, /task/{id})
│   ├── orchestrator.py         ← LangGraph analysis + crisis graphs
│   ├── state.py                ← RepoState TypedDict (Annotated reducers)
│   ├── chroma_utils.py         ← ChromaDB helpers (writable-dir fallback)
│   ├── llm_cache.py            ← diskcache wrapper with retry
│   ├── models/
│   │   ├── requests.py         ← Pydantic request models (8 types)
│   │   └── db.py               ← SQLAlchemy ORM models (Analysis, ShaIndex)
│   ├── services/
│   │   ├── database.py         ← Async engine, session factory, CRUD helpers for Analysis + ShaIndex
│   │   ├── session.py          ← In-memory LRU session cache + DB persist/restore
│   │   ├── sha_cache.py        ← SHA-based snapshot dedup (DB-backed)
│   │   ├── rate_limiter.py     ← 6-endpoint sliding-window rate limiter
│   │   ├── telemetry.py        ← structlog, custom Prometheus middleware, OTel tracing
│   │   ├── task_queue.py       ← asyncio.Queue background worker with UUID task registry
│   │   └── auth.py             ← get_gh_token() / require_gh_token() centralization
│   ├── routes/
│   │   ├── chat.py             ← POST /chat, /chat/stream
│   │   ├── analysis.py         ← GET /analysis/{id}
│   │   ├── fix.py              ← POST /fix, /fix/pr
│   │   ├── pr.py               ← POST /pr-review, /pr-impact, GET /pr-list/{owner}/{repo}
│   │   ├── repos.py            ← GET /repos/{username}
│   │   ├── org.py              ← POST /org-audit
│   │   └── incident.py         ← POST /incident-report
│   ├── ws/
│   │   ├── analyze.py          ← /ws/analyze — streams agent events (optionally auth via WS_AUTH_SECRET)
│   │   └── crisis.py           ← /ws/crisis — Crisis Mode role-play (optionally auth)
│   ├── agents/                 ← 7 LangGraph agent nodes + crisis sub-agents
│   ├── tests/                  ← pytest suite (54 tests, async)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── package.json
    └── src/
        ├── App.js              ← Root component: WS analysis, keyboard shortcuts, theme, state
        ├── api.js              ← Shared fetch helper + all API calls
        ├── constants.js        ← LANG_COLOR map
        ├── setupTests.js       ← Jest polyfills (crypto, sessionStorage, AbortSignal.timeout)
        └── components/         ← 15 tab/page components + utility components
```

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws/analyze` | WS | Streams agent events → diagram, api_docs, findings, CVEs, git_audit |
| `/chat` | POST | `{session_id, question}` → `{answer}` |
| `/chat/stream` | POST | SSE streaming chat — yields `data: {"token": "..."}` |
| `/summary` | POST | `{session_id}` → executive summary |
| `/pr-review` | POST | `{pr_url}` — pass `X-GH-Token` header for private repos |
| `/pr-impact` | POST | `{pr_url, session_id}` — returns `{"task_id": "..."}`; poll `GET /task/{task_id}` for result |
| `/task/{task_id}` | GET | Poll background task status: `{id, status, result?, error?}` |
| `/org-audit` | POST | `{repos: [urls]}` — pass `X-GH-Token` header for private repos |
| `/incident-report` | POST | `{session_id, finding, crisis_messages, outcome}` → 6-section report |
| `/fix` | POST | `{session_id, finding}` → unified diff patch |
| `/fix/pr` | POST | `{session_id, finding}` — requires `X-GH-Token` header; auto-creates GitHub PR with fix |
| `/analysis/{session_id}` | GET | Load a saved analysis snapshot (share links) |
| `/repos/{username}` | GET | List repos — pass `X-GH-Token` header for private repos |
| `/ws/crisis` | WS | Crisis Mode — streams CEO/Legal/Engineering role-play |
| `/health` | GET | `{status, sessions_active, checks}` |
| `/metrics` | GET | Prometheus metrics (`text/plain` — `prometheus_client` format) |

---

## LangGraph pipeline

```
START
  └─► scanner (clone + index)
        ├─► architecture  (Mermaid diagram)
        ├─► api_docs      (endpoint extraction)
        ├─► security      (semgrep SAST + LLM triage)
        ├─► cve_scanner   (OSV.dev lookup)
        ├─► rag_setup     (ChromaDB ingestion)
        ├─► git_audit     (commit log + secret detection)
        └─► END
```

All 7 post-scanner nodes run in parallel. Each is fully error-isolated — a failure returns safe defaults and the rest of the pipeline continues.

---

## Persistence

| Layer | Technology | Purpose |
|---|---|---|
| Analysis snapshots | SQLAlchemy + async | Session state, SHA cache, analysis results |
| SQLite (default) | `aiosqlite` | Zero-config local dev — no DB server needed |
| PostgreSQL (prod) | `asyncpg` | Production — one `DATABASE_URL` env var selects backend |
| ChromaDB | embedded | Vector store for RAG chat (8 context chunks) |
| LLM cache | `diskcache` | Caches Groq API responses keyed by prompt hash |

Database schema is auto-created via SQLAlchemy `create_all()` on startup (`models/db.py`). No manual migrations needed for the current schema.

---

## Background task queue

Heavy operations (PR impact prediction) run in a background `asyncio.Task` consuming an `asyncio.Queue`:

1. **Submit** → `POST /pr-impact` returns `{"task_id": "..."}` immediately after validation
2. **Poll** → `GET /task/{task_id}` returns `{id, status, result?, error?}`
   - Status: `submitted` → `running` → `completed` / `failed`
3. **TTL** → Completed tasks expire after 10 minutes

Tracked via Prometheus counters: `tasks_submitted_total`, `tasks_completed_total`.

---

## Telemetry

| Tool | Purpose |
|---|---|
| `structlog` | Structured JSON logging across all modules |
| `prometheus_client` | `/metrics` — custom `BaseHTTPMiddleware` tracks request count, latency, in-flight, and task counters |
| OpenTelemetry SDK | Manual setup (avoids chromadb version conflicts with `FastAPIInstrumentor`) — traces to configured OTLP endpoint |

Why custom Prometheus middleware instead of `prometheus-fastapi-instrumentator`? That library crashes on `_IncludedRouter` objects from `app.include_router()`. The custom middleware is simpler and more reliable.

---

## Authentication

### REST API — `X-GH-Token` header
- Centralized via `services/auth.py` — `get_gh_token(request)` reads the header with `GITHUB_TOKEN` env fallback
- Every route uses the helper instead of inline header parsing
- Token is never stored in cookies or request bodies

### WebSocket — `WS_AUTH_SECRET`
- Optional env var (disabled by default)
- When set, WS clients must send `ws_auth_secret` in their initial JSON payload
- Missing/mismatched secret → close frame code 1008 (policy violation)

### User-level PAT (frontend)
- Enter in the token field (lock icon in command bar)
- Stored in `sessionStorage` — clears on browser close
- Passed as `X-GH-Token` in every API call
- Scopes: `repo` for private repo access and auto-fix PRs

---

## Testing

### Backend (pytest — 54 tests)

```bash
cd backend
python -m pytest tests/ -v
```

Uses `pytest-asyncio` with `asyncio_mode = auto`. Tests create an isolated temp SQLite database. Patches target `services.database.*` for DB operations.

| Test file | Coverage |
|---|---|
| `tests/test_models.py` | Pydantic request model validation |
| `tests/test_rate_limiter.py` | Sliding-window rate limiter |
| `tests/test_session.py` | LRU cache + DB persist/restore |
| `tests/test_sha_cache.py` | SHA-index dedup |
| `tests/test_routes.py` | REST endpoint integration (mock DB) |

### Frontend (Jest — 49 tests)

```bash
cd frontend
npx react-scripts test --watchAll=false
```

| Test file | Coverage |
|---|---|
| `src/constants.test.js` | LANG_COLOR hex values |
| `src/api.test.js` | Error shape parsing |
| `src/components/ErrorBoundary.test.jsx` | Crash isolation |
| `src/App.test.js` | Root component rendering |

---

## GitHub Authentication

**In-UI token (per user, recommended)**

Enter a Personal Access Token in the token field (lock icon in the command bar). Stored in `sessionStorage` — clears on browser close. Sent to the backend as the `X-GH-Token` request header — never stored in cookies or request bodies.

- Create at: `github.com/settings/tokens/new` → select **`repo`** scope
- Enables: loading private repos, analyzing private repos, PR review of private repos, auto-fix PRs

**Server-side `GITHUB_TOKEN` env var**

Set in `backend/.env`. Applies to all users — useful for raising the public API rate limit (60 → 5 000 req/hr). Does not grant access to individual users' private repos.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + K` | Open command palette |
| `⌘/Ctrl + R` | Re-analyze current repo |
| `⌘/Ctrl + 1-7` | Switch tabs |
| `?` | Toggle keyboard shortcut help |
| `+` / `-` | Zoom in / out (Architecture tab) |
| `0` | Reset zoom (Architecture tab) |
| `F` | Fit diagram to screen (Architecture tab) |

---

## Deployment

### Docker Compose (recommended)

```bash
docker compose up -d --build
```

Includes PostgreSQL + automated health checks. Frontend served via nginx on port 80.

### Backend — any Python host (Render, Fly.io, EC2)

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `GROQ_API_KEY` and optionally `GITHUB_TOKEN`, `WS_AUTH_SECRET`, `DATABASE_URL` as env vars.

### Frontend — Cloudflare Pages (or any static host)

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `build`
- Env var: `REACT_APP_API_BASE=https://your-backend-url`

`frontend/public/_redirects` handles SPA routing on Cloudflare Pages automatically.
