<p align="center">
  <h1 align="center">🧠 Git-Mind</h1>
  <p align="center"><strong>Multi-agent repository intelligence platform</strong></p>
  <p align="center">Enter a GitHub username — 9 AI agents run in parallel and produce architecture diagrams, security audits, CVE scans, code analysis, and a shareable report.</p>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.2.0-blue.svg?cacheSeconds=2592000" />
  <a href="https://github.com/Ayyankhan101/Git-Mind/actions"><img src="https://github.com/Ayyankhan101/Git-Mind/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/backend/tests/"><img src="https://img.shields.io/badge/backend-608%20tests-brightgreen" alt="Backend Tests"></a>
  <a href="https://github.com/Ayyankhan101/Git-Mind/blob/main/frontend/src/"><img src="https://img.shields.io/badge/frontend-192%20tests-brightgreen" alt="Frontend Tests"></a>
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

---

## Table of Contents

- [Features](#features)
- [Quickstart](#quickstart)
- [Project Layout](#️-project-layout)
- [GitHub Authentication](#github-authentication)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Contributing](#contributing)
- [Author](#author)
- [License](#-license)

### Reference docs

The deep reference material lives in [`docs/`](docs/) so this page stays
readable:

| Doc | Covers |
| --- | ------ |
| [Architecture](docs/architecture.md) | System overview, agent pipeline, storage & auth, Rust native acceleration |
| [Configuration](docs/configuration.md) | All 30 environment variables |
| [API Reference](docs/api-reference.md) | All 25 endpoints |
| [RAG Pipeline](docs/rag-pipeline.md) | Retrieval stages, chunking, LLM output reliability |
| [Operations](docs/operations.md) | Persistence, rate limiting, security, telemetry |
| [Development](docs/development.md) | CI/CD, testing, deployment |
| [GitHub OAuth](docs/github-oauth/how-to.md) | Sign-in setup, tutorial and reference |
| [Distributed primitives](docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md) | Multi-worker Redis/Qdrant story |
| [ADRs](docs/adr/) | Architecture decision records |

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
<summary><strong>Project Layout</strong></summary>

```
Git-Mind/
├── docker-compose.yml              ← Production compose
├── docker-compose.dev.yml          ← Dev compose (hot-reload)
├── Dockerfile                      ← Multi-stage: rust → backend → frontend → runner
├── start.sh / stop.sh              ← Bare-metal launcher
│
├── backend/
│   ├── app/                        ← ASGI entrypoint (uvicorn app.main:app)
│   │   ├── main.py                 ← FastAPI app
│   │   ├── orchestrator.py         ← LangGraph analysis + crisis graphs (9-agent DAG)
│   │   └── agent_types.py          ← Shared agent TypedDicts
│   ├── core/                       ← Cross-cutting config and caching
│   │   ├── settings.py             ← Centralized LLM config (model, temps, factory)
│   │   ├── state.py                ← RepoState TypedDict
│   │   ├── llm_cache.py            ← diskcache + invoke_json_with_retry
│   │   └── dspy_setup.py           ← DSPy import guard
│   ├── vectors/                    ← RAG storage backends
│   │   ├── vector_store.py         ← Facade — picks a backend from QDRANT_URL
│   │   ├── chroma_utils.py         ← ChromaDB helpers + hybrid search
│   │   └── qdrant_utils.py         ← Qdrant + fastembed
│   ├── agents/                     ← 9 LangGraph agent nodes + crisis sub-agents
│   ├── routes/                     ← REST API endpoints
│   ├── ws/                         ← WebSocket handlers (analyze, crisis)
│   ├── models/                     ← SQLAlchemy + Pydantic
│   ├── services/                   ← Auth, cache, rate limiter, BM25 FTS5, reranker
│   ├── scripts/                    ← smoke_test, live DSPy e2e + optimize watcher
│   ├── alembic/                    ← Database migrations
│   └── tests/                      ← 608 pytest tests
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
        ├── components/
        │   ├── tabs/               ← The 11 dashboard tabs
        │   ├── scene/              ← three / R3F surface
        │   ├── layout/             ← DashboardLayout, NavRail, Sidebar, ThemeSwitcher
        │   ├── overlays/           ← Modals, drawers, palette, toasts
        │   ├── landing/            ← LandingPage and its cards
        │   └── diagram/            ← @xyflow custom nodes and edges
        └── ...                     ← 192 Jest tests
```

</details>

---

## GitHub Authentication

Setting up "Sign in with GitHub" for your own deployment? See
[docs/github-oauth](docs/github-oauth/tutorial.md) — tutorial, how-to,
reference, and design rationale.

| Method                      | Scope                            | How                                                                     |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **Sign in with GitHub**     | Private repos, auto-fix PRs      | OAuth button on the landing page / dashboard lock icon — same token storage as In-UI PAT below, just no manual PAT generation. [Setup guide](docs/github-oauth/how-to.md) |
| **In-UI PAT**                | Private repos, auto-fix PRs      | Paste one via the landing page or the dashboard's lock icon — encrypted `localStorage` (AES-GCM, 1h TTL) |
| **Server `GITHUB_TOKEN`**   | Rate limit boost (60 → 5,000/hr) | Set in `backend/.env`                                                   |
| **Service key**             | CI/CD — bypasses rate limits     | `GITMIND_SERVICE_KEY` → `X-Service-Key` header                          |

> Git operations use `GIT_ASKPASS` helper — token never in URLs or logs.

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
