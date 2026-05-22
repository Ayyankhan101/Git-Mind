# GitMind

Multi-agent repo intelligence platform. Enter a GitHub username (and optionally a PAT for private repos), pick a repo → 7 agents run in parallel → architecture diagram, API docs, security audit, CVE scan, git commit audit, RAG chat, shareable report. Optional Crisis Mode role-plays a security incident with CEO / Legal / Engineering / Reporter agents.

**Stack:** FastAPI · LangGraph · Groq (llama-3.3-70b-versatile) · ChromaDB · React · Mermaid · semgrep · OSV.dev · diskcache

---

## Features

| Feature | Description |
|---|---|
| **Architecture diagram** | Mermaid graph of component relationships using 24K-token context window; pan/zoom/fullscreen with keyboard shortcuts |
| **API doc agent** | Extracts every HTTP endpoint (method, route, description, parameters, auth_required) across FastAPI, Flask, Express, Django, Rails, Spring, NestJS, Gin, Echo, and more |
| **Security auditor** | semgrep SAST scan triaged by llama-3.3-70b; findings include exploit scenario, **remediation step**, and **CWE identifier**; ranked Critical → Low |
| **CVE scanner** | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — supports PyPI, npm (package-lock/yarn/pnpm), Cargo, Go (go.sum + go.mod), Ruby, and **PHP (composer.lock)** |
| **Git Audit** | Commit log analysis (100 commits): message quality, hardcoded secret detection, sensitive file tracker |
| **Auto-fix patches** | Click "Generate Fix" on any finding → unified diff patch from LLM + RAG context |
| **PR Review** | Paste any GitHub PR URL → structured review with file:line issues and verdict; results cached by PR head SHA |
| **Predictive PR Impact** | After analyzing a repo, enter a PR URL → health score delta, new/fixed findings and CVEs vs base |
| **Org-wide CVE Dashboard** | Scan all loaded repos for CVEs via GitHub API — cross-repo shared vulnerability detection |
| **Incident Close Loop** | After Crisis Mode ends, generate a full incident report (timeline, impact, stakeholder statement, remediation checklist, lessons learned) |
| **RAG chat** | Ask anything about the codebase; ChromaDB (8 context chunks) + streaming SSE responses |
| **Crisis Mode** | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if team is too slow |
| **Shareable links** | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL |
| **Export report** | Download full analysis as Markdown |
| **Private repo access** | Enter a GitHub PAT in the command bar to load and analyze private repositories |

---

## Quickstart — Docker (recommended)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...

./gitmind.sh start          # dev mode:  frontend :3002, backend :8002
./gitmind.sh start prod     # prod mode: frontend :80,   backend :8002
```

| URL | Service |
|---|---|
| http://localhost:3002 | Frontend (dev) |
| http://localhost:80 | Frontend (prod) |
| http://localhost:8002 | Backend API |

---

## Quickstart — Bare-metal (no Docker)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add GROQ_API_KEY=gsk_...

./start.sh          # starts backend (:8002) + frontend (:3000)
./stop.sh           # stops both
./stop.sh restart   # restart both
```

Logs are written to `logs/backend.log` and `logs/frontend.log`.

---

## Script reference

### `gitmind.sh` — Docker launcher

```
./gitmind.sh <command> [dev|prod]
```

| Command | Description |
|---|---|
| `start [dev\|prod]` | Build images and start containers (detached). Default: `dev` |
| `stop [dev\|prod]` | Gracefully stop containers (`--timeout 10`) |
| `restart [dev\|prod]` | Restart running containers |
| `status [dev\|prod]` | Show container and port status |
| `logs [dev\|prod]` | Tail live container logs (Ctrl+C to exit) |
| `build [dev\|prod]` | Rebuild Docker images without starting |
| `clean [dev\|prod]` | Stop containers and delete volumes (ChromaDB data lost) |

### `start.sh` / `stop.sh` — Bare-metal launcher

| Command | Description |
|---|---|
| `./start.sh` | Start backend + frontend, write PIDs to `.pids` |
| `./stop.sh` | Graceful stop (SIGTERM → SIGKILL after 5 s) |
| `./stop.sh restart` | Stop then start |

### `Makefile` shortcuts

```bash
make dev          # docker dev start
make prod         # docker prod start
make stop         # docker dev stop
make restart      # docker dev restart
make logs         # docker dev logs
make status       # container + port status
make build        # rebuild dev images
make clean        # remove dev containers + volumes
make start        # bare-metal start
make bare-stop    # bare-metal stop
make bare-restart # bare-metal restart
make smoke        # run pre-demo smoke test
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key — free at [console.groq.com](https://console.groq.com) |
| `GITHUB_TOKEN` | No | Server-side GitHub PAT — raises rate limit to 5 000 req/hr for all users |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:3000,…`) |
| `REACT_APP_API_BASE` | No | Backend base URL (default: auto-derived from `window.location`) |

---

## Project layout

```
IM-Hackathon/
├── gitmind.sh           ← Docker launcher (start/stop/restart/status/logs/build/clean)
├── start.sh             ← Bare-metal start (writes PIDs to .pids)
├── stop.sh              ← Bare-metal stop/restart
├── Makefile             ← Shortcuts for both modes
├── docker-compose.yml       ← Production compose
├── docker-compose.dev.yml   ← Dev compose (hot-reload)
├── Dockerfile
├── nginx.conf
├── backend/
│   ├── main.py              ← All HTTP + WebSocket endpoints
│   ├── orchestrator.py      ← LangGraph analysis + crisis graphs
│   ├── state.py             ← RepoState TypedDict (Annotated reducers)
│   ├── chroma_utils.py      ← ChromaDB helpers (writable-dir fallback)
│   ├── llm_cache.py         ← diskcache wrapper with retry
│   ├── smoke_test.py        ← Pre-demo health check (10 checks)
│   ├── requirements.txt
│   ├── .env.example
│   └── agents/
│       ├── scanner.py       ← Git clone + file indexing (branch param for PR head)
│       ├── architecture.py  ← Mermaid diagram (70b, 24K token budget, 14 key files)
│       ├── api_doc.py       ← Endpoint extraction (70b, 10 files, 13 framework patterns)
│       ├── security.py      ← semgrep SAST + LLM triage (70b) → exploit + remediation + CWE
│       ├── cve_scanner.py   ← OSV.dev CVE lookup (PyPI/npm/Cargo/Go/Ruby/PHP)
│       ├── git_audit.py     ← Commit log analysis (100 commits) + secret/sensitive-file detection
│       ├── health.py        ← Health score computation (A–F grade)
│       ├── impact.py        ← compute_impact() — diffs two analysis snapshots
│       ├── pr_review.py     ← GitHub PR diff + LLM review (cached by head SHA)
│       ├── rag_setup.py     ← ChromaDB ingestion
│       ├── chat.py          ← RAG query (8 chunks) + SSE streaming
│       ├── blame.py         ← Git blame enrichment
│       └── crisis/
│           ├── _base.py
│           ├── router.py
│           ├── ceo.py
│           ├── legal.py
│           ├── engineer.py
│           └── reporter.py
└── frontend/
    ├── package.json
    ├── public/
    │   └── _redirects       ← Cloudflare Pages SPA fallback
    └── src/
        ├── App.js
        ├── api.js           ← Shared fetch helper + all API calls
        ├── constants.js
        └── components/
            ├── AgentPipeline.jsx     ← Live agent progress (7 agents)
            ├── DiagramTab.jsx        ← Mermaid pan/zoom diagram
            ├── DocsTab.jsx           ← API endpoint browser
            ├── SecurityTab.jsx       ← SAST findings + Generate Fix
            ├── CveTab.jsx            ← OSV.dev CVE results
            ├── GitAuditTab.jsx       ← Commit log, secret detection, sensitive files
            ├── PRReviewTab.jsx       ← PR review + Predict Impact panel
            ├── OrgAuditModal.jsx     ← Cross-repo CVE dashboard
            ├── SummaryTab.jsx        ← Health score + executive summary
            ├── ChatTab.jsx           ← SSE streaming RAG chat
            ├── CrisisChat.jsx        ← Crisis role-play + incident report generator
            ├── Sidebar.jsx           ← Repo list, saved views
            ├── HealthCard.jsx        ← Score card component
            ├── CommandPalette.jsx    ← Cmd+K command palette
            ├── ErrorBoundary.jsx     ← Per-tab crash isolation
            ├── KeyboardHelp.jsx      ← Keyboard shortcut modal
            ├── Onboarding.jsx        ← First-run guide
            ├── ToastSystem.jsx       ← Toast notifications
            └── FilePreviewDrawer.jsx ← Source file viewer
```

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

All 7 post-scanner nodes run in parallel. Each is fully error-isolated — a failure returns safe defaults; the rest of the pipeline continues.

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws/analyze` | WS | Streams agent events → diagram, api_docs, findings, CVEs, git_audit |
| `/chat` | POST | `{session_id, question}` → `{answer}` |
| `/chat/stream` | POST | SSE streaming chat — yields `data: {"token": "..."}` |
| `/summary` | POST | `{session_id}` → executive summary |
| `/pr-review` | POST | `{pr_url, token?}` → structured LLM code review |
| `/pr-impact` | POST | `{pr_url, session_id, token?}` → health delta vs base session |
| `/org-audit` | POST | `{repos: [urls], token?}` → per-repo CVEs + shared vulnerabilities |
| `/incident-report` | POST | `{session_id, finding, crisis_messages, outcome}` → 6-section report |
| `/fix` | POST | `{session_id, finding}` → unified diff patch |
| `/fix/pr` | POST | `{session_id, finding, token}` → auto-creates GitHub PR with fix |
| `/analysis/{session_id}` | GET | Load a saved analysis snapshot (share links) |
| `/repos/{username}` | GET | List repos — pass `X-GH-Token` header for private repos |
| `/ws/crisis` | WS | Crisis Mode — streams CEO/Legal/Engineering role-play |
| `/health` | GET | `{status, sessions_active}` |

---

## Smoke test

Run before every demo:

```bash
make smoke
# or
cd backend && venv/bin/python3 smoke_test.py
```

All 10 checks must pass. Fix any failure before going on stage.

---

## GitHub Authentication

**In-UI token (per user, recommended)**

Enter a Personal Access Token in the token field (lock icon in the command bar). Stored in `sessionStorage` — clears on browser close.

- Create at: `github.com/settings/tokens/new` → select **`repo`** scope
- Enables: loading private repos, analyzing private repos, PR review of private repos

**Server-side `GITHUB_TOKEN` env var**

Set in `backend/.env`. Applies to all users — useful for raising the public API rate limit (60 → 5 000 req/hr). Does **not** grant access to individual users' private repos.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + K` | Open command palette |
| `⌘/Ctrl + R` | Re-analyze current repo |
| `?` | Toggle keyboard shortcut help |
| `+` / `-` | Zoom in / out (Architecture tab) |
| `0` | Reset zoom (Architecture tab) |
| `F` | Fit diagram to screen (Architecture tab) |

---

## Deployment

### Backend — any Python host (Render, Fly.io, EC2)

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `GROQ_API_KEY` and optionally `GITHUB_TOKEN` as env vars.

### Frontend — Cloudflare Pages (or any static host)

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `build`
- Env var: `REACT_APP_API_BASE=https://your-backend-url`

`frontend/public/_redirects` handles SPA routing on Cloudflare Pages automatically.
