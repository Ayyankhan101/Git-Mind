# GitMind

Multi-agent repo intelligence platform. Enter a GitHub username (and optionally a PAT for private repos), pick a repo → 7 agents run in parallel → architecture diagram, API docs, security audit, CVE scan, git commit audit, RAG chat, shareable report. Optional Crisis Mode role-plays a security incident with CEO / Legal / Engineering / Reporter agents.

**Stack:** FastAPI · LangGraph · Groq (llama-3.3-70b-versatile) · ChromaDB · React · Mermaid · semgrep · OSV.dev

---

## Features

| Feature | Description |
|---|---|
| **Architecture diagram** | Mermaid graph of the repo's component relationships; pan/zoom/fullscreen with keyboard shortcuts |
| **API doc agent** | Extracts every HTTP endpoint with method, route, and description |
| **Security auditor** | semgrep SAST scan; findings ranked Critical → Low with exploit scenarios |
| **CVE scanner** | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — supports PyPI, npm, Cargo, Go |
| **Git Audit** | Commit log analysis: message quality (good/vague/poor), hardcoded secret detection, sensitive file tracker |
| **Auto-fix patches** | Click "Generate Fix" on any finding → unified diff patch from LLM + RAG context |
| **PR Review** | Paste any GitHub PR URL → structured review with file:line issues and verdict |
| **Predictive PR Impact** | After analyzing a repo, enter a PR URL → health score delta, new/fixed findings, new/fixed CVEs compared to the base |
| **Org-wide CVE Dashboard** | Scan all loaded repos for CVEs via GitHub API (no clone) — cross-repo shared vulnerability detection |
| **Incident Close Loop** | After Crisis Mode ends, generate a full incident report (timeline, impact, stakeholder statement, remediation checklist, lessons learned) |
| **RAG chat** | Ask anything about the codebase; ChromaDB + streaming SSE responses |
| **Crisis Mode** | Escalation simulation: CEO / Legal / Engineering debate a live incident; reporter publishes if team is too slow |
| **Shareable links** | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL |
| **Export report** | Download full analysis as Markdown |
| **Private repo access** | Enter a GitHub PAT in the command bar to load and analyze private repositories |
| **Sort by last commit** | Repos sorted by `pushed_at` descending — most recently committed on top |
| **Repo history** | Recent repos persisted in localStorage |
| **Browser notifications** | Desktop alert when long analysis completes |

---

## Project layout

```
IM-Hackathon/
├── backend/
│   ├── main.py              ← all HTTP + WebSocket endpoints
│   ├── orchestrator.py      ← LangGraph analysis + crisis graphs
│   ├── state.py             ← RepoState TypedDict (Annotated reducers)
│   ├── chroma_utils.py      ← ChromaDB helpers
│   ├── llm_cache.py         ← diskcache wrapper
│   ├── smoke_test.py        ← pre-demo health check
│   ├── requirements.txt     ← pip dependencies
│   ├── .env.example
│   └── agents/
│       ├── scanner.py       ← git clone + file indexing (supports branch param for PR head)
│       ├── architecture.py  ← Mermaid diagram generation
│       ├── api_doc.py       ← endpoint extraction
│       ├── security.py      ← semgrep SAST
│       ├── cve_scanner.py   ← OSV.dev dependency CVE lookup
│       ├── git_audit.py     ← commit log analysis + secret/sensitive-file detection
│       ├── impact.py        ← compute_impact() — diffs two analysis snapshots
│       ├── pr_review.py     ← GitHub PR diff + LLM review
│       ├── rag_setup.py     ← ChromaDB ingestion
│       ├── chat.py          ← RAG query + SSE streaming
│       └── crisis/
│           ├── _base.py
│           ├── router.py
│           ├── ceo.py
│           ├── legal.py
│           ├── engineer.py
│           └── reporter.py
├── frontend/
│   ├── package.json
│   ├── public/
│   │   └── _redirects       ← Cloudflare Pages SPA fallback
│   └── src/
│       ├── App.js
│       ├── api.js
│       └── components/
│           ├── Sidebar.jsx           ← repo list, saved views, workspace switcher
│           ├── AgentPipeline.jsx     ← live agent progress display (7 agents)
│           ├── DiagramTab.jsx        ← Mermaid pan/zoom diagram
│           ├── DocsTab.jsx           ← API endpoint browser
│           ├── SecurityTab.jsx       ← SAST findings + Generate Fix
│           ├── CveTab.jsx            ← OSV.dev CVE results
│           ├── GitAuditTab.jsx       ← commit log, secret detection, sensitive files
│           ├── PRReviewTab.jsx       ← PR review + Predict Impact panel
│           ├── OrgAuditModal.jsx     ← cross-repo CVE dashboard
│           ├── SummaryTab.jsx        ← health score + executive summary
│           ├── ChatTab.jsx           ← SSE streaming RAG chat
│           ├── CrisisChat.jsx        ← crisis role-play + incident report generator
│           ├── ErrorBoundary.jsx     ← per-tab crash isolation
│           ├── KeyboardHelp.jsx      ← keyboard shortcut modal
│           ├── Onboarding.jsx        ← first-run guide
│           └── FilePreviewDrawer.jsx ← source file viewer
├── Dockerfile               ← multi-stage: backend + nginx frontend
├── docker-compose.yml
├── docker-compose.dev.yml   ← hot-reload dev setup
├── nginx.conf
├── Makefile
└── run.sh
```

---

## Quickstart (Docker)

```bash
cp backend/.env.example backend/.env
# edit backend/.env — add GROQ_API_KEY and optionally GITHUB_TOKEN

docker compose up --build
```

- Frontend: http://localhost:80
- Backend API: http://localhost:8002

---

## Quickstart (manual)

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8002 --reload
```

### Frontend

```bash
cd frontend
npm install
REACT_APP_API_BASE=http://localhost:8002 npm start   # http://localhost:3000
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key — get one free at [console.groq.com](https://console.groq.com) |
| `GITHUB_TOKEN` | No | Server-side GitHub PAT — raises rate limit to 5 000 req/hr for all users; see also in-UI token below |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:3000,http://localhost:3001`) |
| `REACT_APP_API_BASE` | No | Backend base URL (default: auto-derived from `window.location`) |

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws/analyze` | WS | Streams agent events → `architecture_diagram`, `api_docs`, `security_findings`, `cve_findings`, `git_audit` |
| `/chat` | POST | `{session_id, question}` → `{answer}` |
| `/chat/stream` | POST | SSE streaming chat — yields `data: {"token": "..."}` |
| `/summary` | POST | `{session_id}` → executive summary |
| `/pr-review` | POST | `{pr_url, token?}` → structured LLM code review |
| `/pr-impact` | POST | `{pr_url, session_id, token?}` → health delta, new/fixed findings and CVEs vs base session |
| `/org-audit` | POST | `{repos: [urls], token?}` → per-repo CVE counts + cross-repo shared vulnerabilities |
| `/incident-report` | POST | `{session_id, finding, crisis_messages, outcome}` → full incident report (6 sections) |
| `/fix` | POST | `{session_id, finding}` → unified diff patch for a security finding |
| `/fix/pr` | POST | `{session_id, finding, token}` → auto-creates GitHub PR with the fix applied |
| `/analysis/{session_id}` | GET | Load a saved analysis snapshot (used by share links) |
| `/repos/{username}` | GET | List repos — public only by default; pass `X-GH-Token` header to include private repos (sorted by `pushed_at` desc) |
| `/ws/crisis` | WS | Crisis Mode — streams CEO/Legal/Engineering role-play |
| `/health` | GET | `{status, sessions_active}` |

---

## LangGraph pipeline

```
START
  └─► scanner (clone + index)
        ├─► architecture  (Mermaid diagram)
        ├─► api_docs      (endpoint extraction)
        ├─► security      (semgrep SAST)
        ├─► cve_scanner   (OSV.dev lookup)
        ├─► rag_setup     (ChromaDB ingestion)
        ├─► git_audit     (commit log + secret detection)
        └─► END
```

All 7 post-scanner nodes run in parallel. Each is fully error-isolated — a failure returns safe defaults and an error event; the rest of the pipeline continues.

---

## Smoke test

```bash
cd backend && source venv/bin/activate && python smoke_test.py
```

---

## GitHub Authentication (private repos)

GitMind supports two levels of GitHub auth:

**1. In-UI token (per user, recommended)**

Enter a Personal Access Token in the token input field (lock icon, next to the username box). Stored in `sessionStorage` — clears on browser close.

- Create at: `github.com/settings/tokens/new` → select **`repo`** scope
- Enables: loading private repos in sidebar, analyzing private repos (authenticated clone), PR review of private repos

**2. Server-side `GITHUB_TOKEN` env var**

Set on the backend host. Applies to all users — useful for raising the public API rate limit (60 → 5 000 req/hr) without requiring every user to provide a token. Does **not** grant access to private repos of individual users.

> **Note:** GitHub removed basic username+password API auth in August 2021. Only PATs (or OAuth) work.

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

### Backend — any Python host (Render, Fly.io, EC2, etc.)

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set `GROQ_API_KEY` and optionally `GITHUB_TOKEN` as env vars

### Frontend — Cloudflare Pages (or any static host)

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `build`
- Env var: `REACT_APP_API_BASE=https://your-backend-url`

The `frontend/public/_redirects` file handles SPA routing on Cloudflare Pages automatically.
