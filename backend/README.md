---
title: GitMind Backend
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# GitMind Backend

FastAPI + LangGraph backend for [GitMind](https://github.com/Ayyankhan101/Git-Mind) — AI-powered
GitHub repo analysis (architecture diagrams, security/CVE scanning, Solidity audit, RAG chat,
multi-agent crisis simulation).

This Space runs the backend only. The React frontend is deployed on Vercel
and points at this Space via `REACT_APP_API_BASE`.

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 7860 | FastAPI (uvicorn) | Application server — HF Spaces routes external traffic here |
| 8001 | FastAPI (uvicorn) | Direct application port (docker-compose) |
| 8003 | rust-sidecar (Axum) | Solidity parser — `POST /parse`, `GET /health` |

## Rust native components

Two Rust projects are part of this backend:

| Component | Type | Purpose |
|---|---|---|
| `rust-gitmind/` | PyO3 `.so` | Native module `gitmind_core` — lockfile parsing, secret scanning, route detection, comment-ratio scoring |
| `rust-sidecar/` | HTTP sidecar (Axum) | Solidity AST parser via `solang-parser` — port 8003 |

The `gitmind_core` module is compiled during the Docker build (multi-stage: `rust:1.81` builder stage, wheel installed in final image). No runtime dependencies required beyond the `.so` file.

## Required secrets

Set these in **Settings → Variables and secrets**:

| Name | Required | Notes |
|------|----------|-------|
| `GROQ_API_KEY` | ✅ | Groq API key (`gsk_...`) — the app won't start without it. |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins, e.g. your Vercel URL `https://gitmind-peach.vercel.app`. |
| `HF_TOKEN` | ✅ | Hugging Face token with write access — used by CI to upload the Space. |

## Optional environment variables

| Name | Default | Description |
|------|---------|-------------|
| `GITHUB_TOKEN` | — | GitHub PAT — raises API rate limits for repo cloning (60 → 5 000 req/hr) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./gitmind.db` | Production: `postgresql+asyncpg://user:pass@host:5432/gitmind` |
| `REDIS_URL` | — | Redis connection — enables persistent rate-limiter, session cache, task queue |
| `SENTRY_DSN` | — | Sentry DSN for error tracking |
| `ENVIRONMENT` | — | Environment tag for Sentry (`production`, `staging`) |
| `GITMIND_SERVICE_KEY` | — | CI/CD auth key — bypasses rate limits |
| `WS_AUTH_SECRET` | — | WebSocket auth secret (clients must send matching `ws_auth_secret`) |
| `REQUIRE_WS_AUTH` | — | When `true`, reject WS connections without valid auth |
| `SIDECAR_URL` | `http://127.0.0.1:8003` | Solidity parser sidecar endpoint |
| `TASK_WORKERS` | `3` | Background queue worker count |
| `MONITOR_INTERVAL_SECONDS` | `3600` | Repo monitoring loop interval |
| `JSON_LOGS` | — | Enable JSON structured logging |
| `LOG_LEVEL` | `INFO` | Logging level |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OpenTelemetry OTLP gRPC endpoint |
| `DEBUG` | — | Enable health check debug info |

## Endpoint

Once running, the public URL is `https://ak001z-gitmind-backend.hf.space`.
Use that value (no trailing slash) as `REACT_APP_API_BASE` in the frontend.

## Health check

```
GET /health
→ {"status": "ok", "sessions_active": 0, "checks": {...}}
```

The Dockerfile includes a `HEALTHCHECK` instruction that queries this endpoint every 30s with a 20s startup grace period.

## Build

This Space uses a multi-stage Docker build:

1. **`rust-builder`** — `rust:1.81` + maturin, compiles `gitmind_core` from `rust-gitmind/`
2. **Python runtime** — `python:3.11-slim`, installs deps + the `gitmind_core` wheel, caches ChromaDB ONNX model

The `rust-gitmind/` source is included by the CI deploy step (`cp -r rust-gitmind backend/` before upload).
