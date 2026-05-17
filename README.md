# GitMind

Multi-agent repo intelligence platform. Enter a GitHub username, pick a repo → 6 agents run in parallel → architecture diagram, API docs, security audit, CVE scan, RAG chat, shareable report. Optional Crisis Mode role-plays a security incident with CEO / Legal / Engineering / Reporter agents.

**Stack:** FastAPI · LangGraph · Groq (llama-3.3-70b-versatile) · ChromaDB · React · Mermaid · semgrep · OSV.dev

---

## Features

| Feature | Description |
|---|---|
| **Architecture diagram** | Mermaid graph of the repo's component relationships |
| **API doc agent** | Extracts every HTTP endpoint with method, route, and description |
| **Security auditor** | semgrep SAST scan; findings ranked Critical → Low with exploit scenarios |
| **CVE scanner** | Checks dependency lockfiles against [OSV.dev](https://osv.dev) — supports PyPI, npm, Cargo, Go |
| **Auto-fix patches** | Click "Generate Fix" on any finding → unified diff patch from LLM + RAG context |
| **PR Review** | Paste any public GitHub PR URL → structured review with file:line issues and verdict |
| **RAG chat** | Ask anything about the codebase; ChromaDB + streaming SSE responses |
| **Crisis Mode** | Escalation simulation: CEO / Legal / Engineering debate a live incident |
| **Shareable links** | Analysis snapshots saved server-side; share via `?share=SESSION_ID` URL |
| **Export report** | Download full analysis as Markdown |
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
│       ├── scanner.py       ← git clone + file indexing
│       ├── architecture.py  ← Mermaid diagram generation
│       ├── api_doc.py       ← endpoint extraction
│       ├── security.py      ← semgrep SAST
│       ├── cve_scanner.py   ← OSV.dev dependency CVE lookup
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
│           ├── AgentProgress.jsx
│           ├── DiagramTab.jsx
│           ├── DocsTab.jsx
│           ├── SecurityTab.jsx   ← with Generate Fix button
│           ├── CveTab.jsx        ← OSV.dev CVE results
│           ├── PRReviewTab.jsx   ← PR review UI
│           ├── SummaryTab.jsx
│           ├── ChatTab.jsx       ← SSE streaming chat
│           ├── RepoList.jsx      ← with history chips
│           └── CrisisChat.jsx
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
| `GITHUB_TOKEN` | No | GitHub PAT — raises API rate limit to 5 000 req/hr; required for private repo PR reviews |
| `REACT_APP_API_BASE` | No | Backend base URL (default: auto-derived from `window.location`) |

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws/analyze` | WS | Streams agent events → `architecture_diagram`, `api_docs`, `security_findings`, `cve_findings` |
| `/chat` | POST | `{session_id, question}` → `{answer}` |
| `/chat/stream` | POST | SSE streaming chat — yields `data: {"token": "..."}` |
| `/summary` | POST | `{session_id}` → executive summary |
| `/pr-review` | POST | `{pr_url, token?}` → structured LLM code review |
| `/fix` | POST | `{session_id, finding}` → unified diff patch for a security finding |
| `/analysis/{session_id}` | GET | Load a saved analysis snapshot (used by share links) |
| `/repos/{username}` | GET | List public GitHub repos for a user |
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
        └─► END
```

All 6 post-scanner nodes run in parallel. Each is fully error-isolated — a failure returns safe defaults and an error event; the rest of the pipeline continues.

---

## Smoke test

```bash
cd backend && source venv/bin/activate && python smoke_test.py
```

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
