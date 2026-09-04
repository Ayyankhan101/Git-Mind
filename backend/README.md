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

This Space runs the backend only. The React frontend is deployed on Cloudflare Pages
and points at this Space via `REACT_APP_API_BASE`.

## Ports

| Port | Service             | Description                                                 |
| ---- | ------------------- | ----------------------------------------------------------- |
| 7860 | FastAPI (uvicorn)   | Application server — HF Spaces routes external traffic here |
| 8001 | FastAPI (uvicorn)   | Direct application port (docker-compose)                    |
| 8003 | rust-sidecar (Axum) | Solidity parser — `POST /parse`, `GET /health`              |

## Rust native components

Two Rust projects are part of this backend:

| Component       | Type                | Purpose                                                                                                  |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `rust-gitmind/` | PyO3 `.so`          | Native module `gitmind_core` — lockfile parsing, secret scanning, route detection, comment-ratio scoring |
| `rust-sidecar/` | HTTP sidecar (Axum) | Solidity AST parser via `solang-parser` — port 8003                                                      |

The `gitmind_core` module is compiled during the Docker build (multi-stage: `rust:1.81` builder stage, wheel installed in final image). No runtime dependencies required beyond the `.so` file.

## LLM layer (DSPy)

The seven structured-output agents run typed [DSPy](https://dspy.ai) programs instead of
free-form prompts + `json.loads`. Pydantic models declare the output contract, so malformed
JSON, wrong types, and missing keys fail validation and hit each agent's fallback path rather
than shipping silently:

| Agent                       | Signature                | Output                                          |
| --------------------------- | ------------------------ | ----------------------------------------------- |
| `security`                  | `SecurityTriage`         | `list[SecurityFinding]`                          |
| `api_doc`                   | `ApiDocSignature`        | `list[ApiEndpoint]`                              |
| `impact` (merge prediction) | `MergePredictionSignature` (`ChainOfThought`) | `MergePrediction`        |
| `solidity_agent`            | `SolidityTriage`         | `list[SolidityFinding]`                          |
| `language_audit`            | `CodeAuditSignature`     | `list[CodeAuditFinding]`                         |
| `pr_review`                 | `PRReviewSignature` (`ChainOfThought`)         | `PRReviewOutput` → markdown     |
| `architecture`              | `ArchitectureSignature`  | `diagram` (Mermaid string)                       |

Each agent keeps its public `run_*(...)` signature, so orchestration, routes, and the
frontend contract are unchanged. Orchestration stays on LangGraph; chat and crisis agents
still use LangChain (`settings.get_llm`).

**`dspy_setup.py` import guard** — DSPy 3.x lazy-imports optional deps by swapping a
`_LazyModule` proxy into `sys.modules`. The numpy proxy breaks chromadb's
`from numpy.typing import NDArray` submodule import (`TypeError: data type 'bool' not
understood`). Loading the real numpy *before* dspy prevents the proxy from being created, so
every dspy import in this repo must go through `from dspy_setup import dspy`.

**`settings.get_dspy_lm()`** — the shared LM factory for DSPy programs. Mirrors `get_llm`:
same `LLM_MODEL`, same per-use-case `TEMPERATURES`, exposed as
`dspy.LM("groq/<model>")` with `cache=False` (DSPy's internal response cache is disabled
because the existing cache wraps program calls).

**Cache-key scheme** — `llm_cache.run_dspy_cached()` wraps every program call in the existing
Redis → diskcache layer. The key is a SHA-256 of the program signature plus the serialized
(sort-ordered) inputs under the agent's namespace (e.g. `{LLM_MODEL}:security:json`), so
identical calls short-circuit before reaching the LLM. The cached value is the typed output
serialized as JSON; failures are never cached.

## Self-optimization (MIPROv2)

The DSPy seam exists so each program's instructions and few-shot demos can be
re-optimized against real collected data and hot-swapped in — with zero change to
`run_*(...)` signatures, the orchestrator, routes, or the frontend contract. The
pipeline lives in `backend/optimization/`:

| Module        | Purpose                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `registry.py` | `define_program()` — the one-line agent hook. `load_program()` returns the promoted program when active, else a fresh student. Promotion state in `backend/optimized/active.json` (gitignored), versioned artifacts as dspy pickle dirs with rollback history. |
| `trainsets.py`| `harvest()` replays the live telemetry JSONL (`.dspy_harvest/`, written on every cache miss by `run_dspy_cached`) into `dspy.Example` trainsets — free, model-generated weak labels. `load_gold()` loads curated gold sets (10–12 per agent) from `optimization/gold/<agent>.json`, validated against the same Pydantic output models (invalid entries rejected). |
| `metrics.py`  | `make_metric(agent)` — structural validity (reuses the agents' own Pydantic models) + gold-agreement scoring (route/method match, verdict match, node overlap, …). |
| `budget.py`   | Pre-compile token estimator + daily-window guard. A live `auto="light"` compile burns thousands of tokens — the on-demand Groq window (100K TPD) binds fast. |
| `run.py`      | `compile_agent()` + CLI: harvest → gold valset → baseline → MIPROv2 (`auto="light"`) → gate → promote only when the optimized program beats the baseline by the margin. |

```bash
cd backend
# cadence run (one agent, off-peak, with the real remaining window)
venv/bin/python -m optimization.run --agent security --budget 40000
# cheapest live smoke: zeroshot, single candidate, no bootstrap demos
venv/bin/python -m optimization.run --agent security --auto none --candidates 1 \
    --trials 1 --demos 0 --avg-input-tokens 150 --budget 10000
# revert a bad promotion to the previous artifact
venv/bin/python -m optimization.run --rollback security
# live e2e compile — cap the gold valset when the window is tight
# (baseline eval costs ~650 tokens per example):
venv/bin/python live_dspy_e2e.py --optimize security --min-gold 2
```

The CLI loads `.env` itself and imports the 7 agents (nothing else does).
`--auto none --candidates N --trials N` is the deep-tuning path; `--demos N`
sets bootstrapped+labeled demos (`0` = zeroshot optimization);
`--avg-input-tokens` calibrates the budget estimate to the agent's real input
size (the 2,000 default overestimates small-input agents ~10×); the guard is
only as good as the `--budget` / `GROQ_DAILY_REMAINING` value you feed it.
`--agent` and `--rollback` are mutually exclusive — `--rollback <agent>`
reverts to the previous promoted artifact from `active.json` rollback history
(keeps the last 3) and exits before any harvest/compile work.
`live_dspy_e2e.py --optimize` also takes `--min-gold N` to cap the gold
valset to its first N examples (refused when the curated set has fewer than
N) — the baseline eval costs ~650 tokens per example, so a tight Groq window
can gate on a 2-example valset and reach the compile phase.

Verified against the installed dspy 3.3.0 (not docs): `num_trials` goes on
`compile()`, not the constructor; `auto` overrides `num_candidates`/`num_trials`
(passing both raises); `prompt_model` + `task_model` (or a configured LM) is
mandatory; MIPROv2 search requires `optuna` (in `requirements.txt`);
`minibatch_size` defaults to 35 so small gold valsets must pass it explicitly;
`dspy.Evaluate` requires `devset` in the **constructor**
(`Evaluate(metric=..., devset=...)`, then `evaluator(program)`); and promotion
artifacts are **directories** — `Module.save(path, save_program=True)`
refuses a `.json` path, and `dspy.load(path)` needs `allow_pickle=True`
(artifacts are self-produced by the compile process).

**Cache-key versioning** — MIPROv2 changes a signature's instructions/demos but not its
class name, so a promoted program would keep hitting stale pre-optimization cache entries.
`load_program` stamps `_opt_version` (hash of the artifact) onto promoted programs and
`run_dspy_cached` folds it into the cache key — same inputs + same version still short-circuit;
a bumped version gets fresh keys and the old entries expire via TTL.

## Required secrets

Set these in **Settings → Variables and secrets**:

| Name           | Required | Notes                                                                                     |
| -------------- | -------- | ----------------------------------------------------------------------------------------- |
| `GROQ_API_KEY` | ✅       | Groq API key (`gsk_...`) — the app won't start without it.                                |
| `CORS_ORIGINS` | ✅       | Comma-separated allowed origins, e.g. your Cloudflare Pages URL `https://gitmind-frontend.pages.dev`. |
| `HF_TOKEN`     | ✅       | Hugging Face token with write access — used by CI to upload the Space.                    |

## Optional environment variables

| Name                          | Default                            | Description                                                                   |
| ----------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `GITHUB_TOKEN`                | —                                  | GitHub PAT — raises API rate limits for repo cloning (60 → 5 000 req/hr)      |
| `DATABASE_URL`                | `sqlite+aiosqlite:////tmp/gitmind.db` | Production: `postgresql+asyncpg://user:pass@host:5432/gitmind`            |
| `REDIS_URL`                   | —                                  | Redis connection — enables persistent rate-limiter, session cache, task queue |
| `SENTRY_DSN`                  | —                                  | Sentry DSN for error tracking                                                 |
| `ENVIRONMENT`                 | —                                  | Environment tag for Sentry (`production`, `staging`)                          |
| `GITMIND_SERVICE_KEY`         | —                                  | CI/CD auth key — bypasses rate limits                                         |
| `GITHUB_APP_ID`               | —                                  | GitHub App credentials (webhook flows)                                        |
| `GITHUB_APP_PRIVATE_KEY`      | —                                  | GitHub App private key (webhook flows)                                        |
| `GITHUB_APP_INSTALLATION_ID`  | —                                  | GitHub App installation ID (webhook flows)                                    |
| `GITHUB_APP_WEBHOOK_SECRET`   | —                                  | GitHub App webhook HMAC secret                                                |
| `GROQ_DAILY_REMAINING`        | —                                  | Remaining daily Groq token window for the MIPROv2 budget guard (`optimization.run` aborts before a compile exceeds it; unset/0 disables the guard) |
| `WS_AUTH_SECRET`              | —                                  | WebSocket auth — when set, clients must send matching `ws_auth_secret` + `ws_auth_ts` |
| `SIDECAR_URL`                 | `http://127.0.0.1:8003`            | Solidity parser sidecar endpoint                                              |
| `TASK_WORKERS`                | `3`                                | Background queue worker count                                                 |
| `MONITOR_INTERVAL_SECONDS`    | `3600`                             | Repo monitoring loop interval                                                 |
| `REPORTER_INTERVAL_SEC`       | `45`                               | Crisis Mode reporter check interval                                           |
| `MAX_REQUEST_BODY_BYTES`      | `5242880` (5 MB)                   | Max request body size                                                         |
| `RERANKER_MODEL`              | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder reranker model                                             |
| `LLM_MODEL`                   | `qwen/qwen3.6-27b`                 | Override Groq model for all agents                                            |
| `LLM_MODEL_FALLBACK`          | `llama-3.1-8b-instant`             | Same-provider fallback model — tried automatically if LLM_MODEL fails         |
| `SMTP_HOST` / `SMTP_PORT`     | `587`                              | SMTP server for monitoring email alerts                                       |
| `SMTP_USER` / `SMTP_PASSWORD` | —                                  | SMTP credentials                                                              |
| `SMTP_FROM`                   | —                                  | SMTP sender address                                                           |
| `JSON_LOGS`                   | —                                  | Enable JSON structured logging                                                |
| `LOG_LEVEL`                   | `INFO`                             | Logging level                                                                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | —                                  | OpenTelemetry OTLP gRPC endpoint                                              |
| `DEBUG`                       | —                                  | Enable health check debug info                                                |

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
