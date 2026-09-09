# Configuration

**Required**

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `GROQ_API_KEY` | Groq API key — free at [console.groq.com](https://console.groq.com)       |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `https://gitmind-frontend.pages.dev`) |

**Database & Storage**

| Variable       | Default                               | Description                                            |
| -------------- | ------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL` | `sqlite+aiosqlite:////tmp/gitmind.db` | SQLite for dev; `postgresql+asyncpg://...` for prod    |
| `DATABASE_READ_REPLICA_URL` | —                        | Optional read replica — the 4 read-only history/lookup queries route here instead of `DATABASE_URL`; writes always target `DATABASE_URL` |
| `REDIS_URL`    | —                                     | Enables shared rate limiter, session cache, task queue |
| `QDRANT_URL`   | —                                     | Switch RAG vector search from embedded ChromaDB to a Qdrant sidecar (needed once you run >1 backend worker/replica — see `docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md`) |
| `REQUIRE_REDIS`| `false`                               | When `true`, rate limiter/session store/Redis client fail closed instead of falling back to per-process memory when Redis is down |
| `CLONE_CACHE_BUCKET` | —                                | S3-compatible bucket for caching shallow-clone bundles by repo+SHA — avoids re-cloning the same commit for a repeat PR-impact run or an org-audit that overlaps an already-analyzed repo. Configure a lifecycle rule (~7 days) on the bucket; not tracked in-app |
| `CLONE_CACHE_ENDPOINT_URL` | —                          | Override for non-AWS S3-compatible storage (Cloudflare R2, MinIO, etc.) |

**Authentication & Security**

| Variable                     | Description                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`               | Server-side PAT — raises rate limit to 5,000 req/hr                                   |
| `WS_AUTH_SECRET`             | WebSocket auth — when set, clients must send matching `ws_auth_secret` + `ws_auth_ts` |
| `GITMIND_SERVICE_KEY`        | CI/service key — bypasses rate limits (`X-Service-Key` header)                        |
| `GITHUB_APP_ID`              | GitHub App credentials (webhook flows)                                                |
| `GITHUB_APP_PRIVATE_KEY`     | GitHub App private key (webhook flows)                                                |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App installation ID (webhook flows)                                            |
| `GITHUB_APP_WEBHOOK_SECRET`  | GitHub App webhook HMAC secret                                                        |
| `GITHUB_OAUTH_CLIENT_ID`     | GitHub OAuth App client ID — powers the "Sign in with GitHub" button (distinct from the GitHub App above). Setup: [github-oauth](github-oauth/how-to.md) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret                                                        |
| `OAUTH_REDIRECT_BASE_URL`    | Backend's own public URL, for the redirect_uri sent to GitHub (default: `https://ak001z-gitmind-backend.hf.space`) |
| `OAUTH_FRONTEND_URL`         | Frontend origin the browser returns to after sign-in (default: `https://gitmind-frontend.pages.dev`) |

**Observability**

| Variable                      | Description                               |
| ----------------------------- | ----------------------------------------- |
| `SENTRY_DSN`                  | Sentry DSN for error tracking             |
| `ENVIRONMENT`                 | Environment tag (`production`, `staging`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry OTLP gRPC endpoint          |
| `JSON_LOGS`                   | Enable JSON structured logging            |
| `LOG_LEVEL`                   | Logging level (default: `INFO`)           |

**Email (SMTP alerts)**

| Variable        | Description                       |
| --------------- | --------------------------------- |
| `SMTP_HOST`     | SMTP server for monitoring alerts |
| `SMTP_PORT`     | SMTP port (default `587`)         |
| `SMTP_USER`     | SMTP username                     |
| `SMTP_PASSWORD` | SMTP password                     |
| `SMTP_FROM`     | Sender address                    |

**Tuning**

| Variable                   | Default                                | Description                                            |
| -------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `LLM_MODEL`                | `openai/gpt-oss-120b`                  | Override Groq model for all agents                     |
| `LLM_MODEL_FALLBACK`       | `openai/gpt-oss-20b`                   | Same-provider fallback — tried automatically if `LLM_MODEL` fails (deprecation, rate-limit, loss of account access); set to `""` to disable |
| `LLM_MODEL_CHEAP`          | `openai/gpt-oss-20b`                   | Cheap tier for high-volume, low-judgment agents only (API doc extraction, lint triage) — everything security-critical or user-facing (chat, fix, PR review, security/Solidity triage, incident reports) always uses `LLM_MODEL` |
| `RERANKER_MODEL`           | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder reranker model                           |
| `SIDECAR_URL`              | `http://127.0.0.1:8003`                | Solidity parser sidecar endpoint                       |
| `TASK_WORKERS`             | `3`                                    | Background task queue worker count                     |
| `MONITOR_INTERVAL_SECONDS` | `3600`                                 | Repo monitoring loop interval                          |
| `REPORTER_INTERVAL_SEC`    | `45`                                   | Crisis Mode reporter check interval                    |
| `MAX_REQUEST_BODY_BYTES`   | `5242880` (5 MB)                       | Max request body size                                  |
| `GROQ_DAILY_REMAINING`     | —                                      | Daily token window guard for MIPROv2 self-optimization |
| `DEBUG`                    | —                                      | Enable health check debug info                         |
