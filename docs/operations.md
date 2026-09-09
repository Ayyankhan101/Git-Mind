# Operations

Persistence, rate limiting, security posture, and telemetry.

## Persistence

| Layer              | Technology         | Purpose                                        |
| ------------------ | ------------------ | ---------------------------------------------- |
| Analysis snapshots | SQLAlchemy + async | Session state, SHA cache, analysis results     |
| SQLite (default)   | `aiosqlite`        | Zero-config local dev                          |
| PostgreSQL (prod)  | `asyncpg`          | Production — one env var selects backend       |
| Redis (optional)   | `redis-py`         | Shared rate limiter, session cache, task queue |
| ChromaDB           | embedded           | Vector store for RAG chat (default)            |
| Qdrant (optional)  | sidecar            | Vector store for RAG chat — set `QDRANT_URL` to switch, needed for >1 backend worker |
| LLM cache          | `diskcache`        | Caches Groq API responses                      |

---

## Rate Limiting

Sliding-window limits (Redis-backed, in-memory fallback for dev) keyed by endpoint:

| Endpoint                                       | Limit  | Window |
| ---------------------------------------------- | ------ | ------ |
| `analyze`                                      | 2 req  | 60s    |
| `analyze_chat_burst` (analyze + chat combined) | 10 req | 60s    |
| `summary`                                      | 5 req  | 60s    |
| `chat`                                         | 20 req | 60s    |
| `fix`                                          | 10 req | 60s    |
| `pr`                                           | 5 req  | 60s    |
| `pr_impact`                                    | 3 req  | 60s    |
| `org_audit`                                    | 3 req  | 60s    |
| `repos`                                        | 20 req | 60s    |
| `monitor`                                      | 10 req | 60s    |
| `webhook_notify`                               | 10 req | 60s    |
| `analysis_get`                                 | 30 req | 60s    |
| `analysis_previous`                            | 20 req | 60s    |
| `analysis_history`                             | 20 req | 60s    |
| `task`                                         | 30 req | 60s    |

Requests authenticated with a valid `GITMIND_SERVICE_KEY` (`X-Service-Key` header) bypass rate limits.
Rate-limited requests return HTTP 429 with `Retry-After` header.

---

## Security

Defense-in-depth posture — 20-point checklist status:

| Control                | Status                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Hide API keys          | ✅ Env-only (`GROQ_API_KEY`, `GITHUB_TOKEN`, `SMTP_PASSWORD`); `.env` untracked                |
| Purge git secrets      | ✅ History clean (test placeholders only); `gitleaks` in pre-commit + CI `security` job        |
| Public DB key          | ✅ No DB credentials in code; env via compose                                                  |
| Row-level security     | N/A — single-tenant; access controlled per session                                             |
| Encrypt sensitive data | ✅ Frontend PAT AES-GCM (1h TTL); `gh_token` stripped before persistence                       |
| Server-side auth       | ✅ Default-deny middleware; allowlist public paths; webhook HMAC-verified                      |
| Lock record access     | ✅ Hybrid `/analysis/{id}`: public ≤24h (share-by-URL), authenticated after                    |
| Block field tampering  | ✅ Response whitelist (`_trim_analysis`) — internal fields never leave API                     |
| Secure session cookies | N/A — no cookies; PAT-header auth                                                              |
| Hash passwords         | N/A — no password auth                                                                         |
| Rate limit login       | N/A — no login; 17 endpoint windows + cross-endpoint burst guard                               |
| Bot protection         | ✅ IP-velocity burst cap (analyze + chat combined, 10/60s)                                     |
| Parameterize queries   | ✅ SQLAlchemy ORM; no user input reaches raw SQL                                               |
| Validate all inputs    | ✅ Pydantic bodies + regex validators (repo/PR/username/session UUID)                          |
| Escape user content    | ✅ react-markdown (no raw HTML) + `esc()` on DOM injection + `encodeURIComponent`              |
| Restrict file uploads  | N/A — no upload endpoints                                                                      |
| Trim API responses     | ✅ `_trim_analysis` whitelist; history/org/pr/repos return fixed shapes                        |
| Security headers       | ✅ X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP (report-only), HSTS |
| Force HTTPS            | ✅ Platform-terminated (Cloudflare Pages / HF Spaces)                                   |
| Scan dependencies      | ✅ `pip-audit` + `npm audit` in CI `security` job; Dependabot monthly                          |

---

## Telemetry

| Tool                | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `structlog`         | Structured JSON logging                                       |
| `prometheus_client` | `/metrics` — request count, latency, in-flight, task counters |
| OpenTelemetry       | Distributed tracing via OTLP                                  |
| Sentry              | Error tracking (optional, via `SENTRY_DSN`)                   |
| Correlation IDs     | `X-Request-ID` on every request                               |
