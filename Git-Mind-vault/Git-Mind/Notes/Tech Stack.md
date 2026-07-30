---
tags:
  - tech-stack
aliases: [Technologies, Dependencies]
---

# Tech Stack

## Frontend

| Tech | Version | Purpose |
|------|---------|---------|
| React | 19 | SPA |
| react-app-rewired | — | CRA override |
| Tailwind CSS | 4 | Utility CSS |
| react-markdown | — | Chat output rendering |

## Backend

| Tech | Version | Purpose |
|------|---------|---------|
| Python | 3.13+ | Runtime |
| FastAPI | 0.136.1 | REST + SSE |
| langchain-groq | 1.1.2 | LLM integration |
| ChromaDB | 1.5.9 | Vector store |
| Redis | 5.0+ | State, cache, queue, rate limiting |
| orjson | 2.0+ | Fast JSON for task serialization |
| structlog | 24.1+ | Structured logging |
| prometheus-client | 0.20+ | Metrics |
| opentelemetry-api/sdk | 1.0+ | Distributed tracing |
| sentry-sdk | 2.0+ | Error tracking |
| diskcache | 5.6.3 | LLM cache fallback |

## Rust

| Package | Purpose |
|---------|---------|
| `rust-gitmind` | Git analysis, AST parsing |
| `rust-sidecar` | Supplementary services |

## Infrastructure

| Tool | Use |
|------|-----|
| Docker | Containerized frontend + backend |
| Nginx | Reverse proxy |
| Vercel | Static deployment option |

## Dev Tools

| Tool | Use |
|------|-----|
| `make` | Build commands |
| `pre-commit` | Lint hooks |
| `husky` | Git hooks |
| `.nvmrc` | Node version |
| `.python-version` | Python version |

## Task List

```dataview
TASK
FROM "Git-Mind/Tasks"
WHERE !completed
AND contains(file.outlinks, this.file.link)
SORT file.name ASC
```

## Related

- [[Notes/Architecture|Architecture]] — system design
- [[Notes/Development|Development]] — setup and commands
- [[Changelog/v0.1|Changelog]] — what was added
