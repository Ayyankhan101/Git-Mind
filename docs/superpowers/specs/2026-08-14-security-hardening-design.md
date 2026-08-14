# Security Hardening Design

Date: 2026-08-14
Status: Approved (user), build in progress
Scope: 20-point security checklist audit + 5-phase hardening

## Audit result (20 items)
- Covered (13): hide API keys, purge secrets (history clean), public DB key, encrypt sensitive data, server-side auth, parameterize queries, validate inputs, escape user content, force HTTPS
- N/A (4): RLS (single-tenant), session cookies/hash passwords/rate-limit login (no cookie/password auth), restrict file uploads (zero upload endpoints)
- Gaps (5): security headers (NONE), dep scanning (NONE), response trimming/field tampering (no response_model), lock record access (public /analysis/{id}), bot protection (per-endpoint only)

## Phase 1 — Headers + scanning
- `backend/services/security_headers.py`: `SecurityHeadersMiddleware(BaseHTTPMiddleware)` setting:
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: none (relax only camera/mic if ever needed)
  - Strict-Transport-Security: max-age=31536000; includeSubDomains (only when request is https or X-Forwarded-Proto=https)
  - CSP: report-only start — `Content-Security-Policy-Report-Only` default-src 'self'; connect-src 'self' https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' (React inline styles need it); font-src 'self' https://fonts.gstatic.com; script-src 'self'
  - Register in main.py before MetricsMiddleware (headers must run on all responses incl. /metrics, /health)
- `frontend/vercel.json`: `headers` key, apply same set to all routes (frontend HTML served by Vercel)
- `.github/workflows/ci.yml`: new job `security` (ubuntu): pip-audit on backend/requirements.txt; npm audit --audit-level=high on frontend (NODE_OPTIONS=""); gitleaks detect --source . (latest release)
- `.github/dependabot.yml`: package-ecosystem pip (backend/) + npm (frontend/), monthly, minor+patch only
- `.pre-commit-config.yaml`: add gitleaks hook (pre-commit/gitleaks) — entry gitleaks protect --staged

## Phase 2 — Trim responses / block field tampering
- Routes returning raw dicts: analysis GET/previous/history, org audit, pr, repos
- Add `response_model` Pydantic models in backend/models/responses.py OR `_trim(snapshot)` whitelist helpers in routes/_errors.py
- Decision: `_trim` dict helpers — snapshot fields are heterogeneous/LLM-shaped; strict response_model would break on evolving schema. Whitelist known public keys per endpoint, drop internal keys (gh_token, chat_history internal fields, chroma_collection_name, head_sha)

## Phase 3 — Hybrid /analysis/{id} access (option C)
- `backend/routes/analysis.py get_analysis`: after UUID + rate-limit checks:
  - `snap` fetched; read `saved_at` from `snap` (Float epoch)
  - if `now - saved_at > 86400` (24h) → `require_gh_token_or_service_key(request)`; else public
  - 404 before auth check (don't leak existence) — keep current order: 404 for missing, auth only for stale-present
- No migration needed (analyses.saved_at exists)

## Phase 4 — Bot protection
- Cross-endpoint IP velocity: new window `"analyze_chat_burst": (60, 10)` in rate_limiter._RATE_WINDOWS; check in ws/analyze.py + routes/chat.py using client_ip (sums analyze+chat)
- UA sanity: in rate_limiter or chat/analyze entry — reject empty/curl-ish UA? Decision: WARN-log only, no reject (API clients legit). Actual guard = velocity cap
- Tighten analyze 3→2/60s (optional, default yes)

## Phase 5 — Verify + docs
- Gates: 245 backend pytest, 164 frontend jest, ruff check+format, prettier, smoke, classname audit
- README: security matrix table (20 items → status/rationale) in SECURITY section

## Target files
backend/main.py, backend/services/security_headers.py (new), backend/services/rate_limiter.py, backend/routes/analysis.py, backend/routes/_errors.py, backend/ws/analyze.py, backend/routes/chat.py, frontend/vercel.json, .github/workflows/ci.yml, .github/dependabot.yml (new), .pre-commit-config.yaml, README.md
