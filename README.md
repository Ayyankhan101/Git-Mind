---
title: GitMind API
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
app_port: 7860
---

# GitMind — Crisis Room

Multi-agent repo intelligence system. Paste a GitHub URL → 4 agents run in parallel → architecture diagram, API docs, security findings, chat-with-the-repo. Optional Crisis Mode dramatises a security leak with CEO/Legal/Engineering/Reporter role-play.

Stack: FastAPI · LangGraph · OpenAI GPT-4o-mini · ChromaDB · React · Mermaid · semgrep

## Project layout

```
IM-Hackathon/
├── backend/                 ← FastAPI + LangGraph
│   ├── main.py              ← /ws/analyze, /ws/crisis, /chat, /health
│   ├── orchestrator.py      ← analysis + crisis graphs
│   ├── state.py             ← shared RepoState (Annotated reducers)
│   ├── chroma_utils.py
│   ├── llm_cache.py
│   ├── smoke_test.py        ← run before demo
│   ├── .env.example         ← copy to .env, add OPENAI_API_KEY
│   └── agents/
│       ├── scanner.py
│       ├── architecture.py
│       ├── api_doc.py
│       ├── security.py
│       ├── rag_setup.py
│       ├── chat.py
│       └── crisis/          ← stretch: CEO/Legal/Engineer/Reporter
│           ├── _base.py
│           ├── router.py
│           ├── ceo.py
│           ├── legal.py
│           ├── engineer.py
│           └── reporter.py
├── frontend/                ← React app
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── api.js
│       └── components/
│           ├── AgentProgress.jsx
│           ├── DiagramTab.jsx
│           ├── DocsTab.jsx
│           ├── SecurityTab.jsx
│           ├── ChatTab.jsx
│           └── CrisisChat.jsx
├── start.sh                 ← Linux/macOS launcher
└── start.bat                ← Windows launcher
```

## Quickstart

1. Add OpenAI key:
   ```bash
   cp backend/.env.example backend/.env
   # edit backend/.env → OPENAI_API_KEY=sk-...
   ```

2. Run:
   ```bash
   ./start.sh           # Linux / macOS
   start.bat            # Windows
   ```

3. Open http://localhost:3000 — paste a GitHub URL, click **⚡ Analyze**.

## Manual setup

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install "fastapi[standard]" uvicorn langgraph langchain langchain-openai \
    langchain-text-splitters chromadb gitpython tiktoken python-dotenv \
    diskcache websockets semgrep
uvicorn main:app --reload                 # http://127.0.0.1:8000
```

### Frontend
```bash
cd frontend
npm install
npm start                                  # http://localhost:3000
```

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/ws/analyze` | WS | streams agent_status, architecture_diagram, api_docs, security_findings, chroma_collection_name |
| `/chat` | POST | `{session_id, question}` → `{answer}` (RAG) |
| `/ws/crisis` | WS | `{session_id, finding_id}` → streams CEO/Legal/Engineering messages, optional Reporter leak |
| `/health` | GET | `{status, sessions_active}` |

## Smoke test

```bash
cd backend && source venv/bin/activate && python smoke_test.py
```

Must show **9/9 PASS** before demo.
