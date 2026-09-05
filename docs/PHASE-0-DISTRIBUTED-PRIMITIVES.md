# Phase 0: Distributed Primitives + Qdrant Migration

## Status: IMPLEMENTED — opt-in, off by default

**Goal:** Fix the 5 immediate blockers that crash or silently break under >1 concurrent user.

**2026-09 update:** All 5 blockers now have a fix in code. This doc previously
said "Not Yet Implemented" for all of them, which had drifted from reality —
blockers 1 (task queue) and 3 (LLM cache) were already done in a prior pass
and the doc was never updated. Blockers 2, 4, and 5 were implemented in this
pass, alongside a deliberate change from the original plan below: **every
fix is gated behind an explicit env var, defaulting to today's behavior.**

Why gate it instead of just flipping the switch, per the original plan: the
live production backend (Hugging Face Spaces) runs today with no Redis and
no Qdrant attached. `ENVIRONMENT` already defaults to `"production"` in
`services/cache.py`, so implementing blockers 4-6 exactly as originally
written — hard-fail when Redis is down in production — would have broken
that deployment on the next `git push` to `main` (CI deploys straight to
prod, no canary/staging gate). Gating means this is safe to merge now and
flip on per-environment once Redis/Qdrant are actually provisioned there:

- **`QDRANT_URL`** — unset: vector search stays on embedded ChromaDB
  (today's behavior, `backend/chroma_utils.py`). Set: `services/vector_store.py`
  switches every caller to `backend/qdrant_utils.py` instead. Decided once,
  at import time.
- **`REQUIRE_REDIS=true`** — unset/false: rate limiter, session store, and
  the Redis client keep today's graceful memory-fallback behavior. Set:
  all three fail closed instead (deny requests / raise / refuse to start)
  the moment Redis is unreachable, so a silently-degraded multi-replica
  deployment becomes a loud one instead.

`docker-compose.yml` (the self-host stack, which already has a real Redis
service) sets both, so self-hosting via Docker Compose gets the full Phase 0
hardening automatically. The Hugging Face Spaces deployment does not set
either yet — see "Open Questions" below, now narrowed to just that decision.

---

## Overview

The current architecture is a single-process monolith with in-memory singletons (task queue, session store, rate limiter, LLM cache, vector DB). These break when:

- Multiple uvicorn workers are spawned
- The process restarts (tasks lost, sessions lost)
- The process is restarted under load

**Phase 0 makes Redis required for production and replaces local ChromaDB with Qdrant** — both opt-in now, per the update above, rather than unconditional.

---

## The 5 Blockers

| #   | Blocker                  | Current (gate off)                                            | Fix (gate on)                       | Status                                            |
| --- | ------------------------ | --------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| 1   | **Task Queue**           | —                                                                | Redis List (`LPUSH`/polled `RPOP`)    | Done — no gate, always Redis-backed               |
| 2   | **Vector DB (ChromaDB)** | `PersistentClient` — file-locked, crashes with >1 worker         | Qdrant sidecar (HTTP API)             | Done — gated on `QDRANT_URL`                      |
| 3   | **LLM Cache**            | —                                                                | Redis primary + diskcache fallback    | Done — no gate, Redis tried first unconditionally |
| 4   | **Rate Limiter**         | In-memory `defaultdict` per-process                              | Redis-only (deny-all if Redis down)   | Done — gated on `REQUIRE_REDIS=true`              |
| 5   | **Session Store**        | In-memory `OrderedDict` (500 cap)                                | Redis-only (raise if Redis down)      | Done — gated on `REQUIRE_REDIS=true`              |

Blockers 1 and 3 have no gate because they were already unconditionally
Redis-backed (1) or Redis-first (3) before this pass — there was nothing to
make opt-in.

---

## Detailed Plan

The sections below are the original plan and are kept as a record of intent.
Three things changed on actual implementation, all in the direction of "keep
today's default behavior working":

- **`chroma_utils.py` was not deleted.** `qdrant_utils.py` was added
  alongside it, matching the "same public API" design below exactly. A new
  `backend/vector_store.py` facade picks one at import time based on
  `QDRANT_URL`, so every "import swap" below is actually one shared import
  (`from vector_store import ...`) rather than a hardcoded switch to
  `qdrant_utils`.
- **Steps 11-15 gained a `REQUIRE_REDIS` gate** instead of unconditionally
  removing the memory fallback — see the Status update at the top of this
  doc for why.
- **`docker-compose.yml`'s `qdrant` service has no `ports:` mapping** — it
  only needs to be reachable from the `app` service over the compose
  network, not from the host.
- **`_worker()` polls `RPOP` instead of blocking on `BRPOP`.** Upstash's
  serverless Redis (HTTP-backed, no long-lived blocking connections) rejects
  blocking commands outright — `this user has no permissions to run the
  'brpop' command`, regardless of ACL settings — so `BRPOP` can never work
  there. Polling `RPOP` every `_POLL_INTERVAL` (0.5s) works identically on
  Upstash and on a real Redis server, at the cost of up to ~0.5s added
  pickup latency, which doesn't matter for this queue's background jobs
  (org-audits, PR-impact scans).
- **`get_session()` keeps its DB fallback even under `REQUIRE_REDIS=true`**,
  rather than raising immediately like `put_session()` does. Redis being down
  doesn't invalidate an already-persisted analysis sitting in Postgres, so it
  only raises once the DB fallback also comes back empty — the in-memory
  fallback is the one skipped when required-and-down (it can't see other
  workers' sessions and would just misreport a real outage as "not found").

### 1. Qdrant Vector DB Migration (replaces ChromaDB)

**New file:** `backend/qdrant_utils.py`

```python
# Public API (same signatures as chroma_utils.py):
embed_codebase(file_contents: dict[str, str], collection_name: str) -> str
search_codebase(collection_name: str, query: str, n_results: int = 5) -> list[dict]
delete_collection(name: str) -> None
prune_old_collections(max_age_seconds: int = 604800) -> int
```

**Key design decisions:**

- Uses **sync** `QdrantClient` (all callers run in thread pools already)
- Uses **fastembed** `TextEmbedding("all-MiniLM-L6-v2")` (same 384-dim model as ChromaDB)
- Singleton pattern for client and embedder
- Collection: `VectorParams(size=384, distance=Distance.COSINE)` — identical to ChromaDB
- Batch upsert: 100 points per batch (same as current)
- Point IDs: deterministic hash for safe re-embedding
- Registry: a Redis hash (`qdrant:collection_registry`) tracks creation times for TTL pruning — not a local file, since app containers have no shared/persistent volume (a local-file registry would be silently reset on every container recreation, orphaning every previously-created collection from pruning). Uses a plain sync `redis` client (this module is intentionally sync); absent `REDIS_URL`, registration/pruning tracking is a no-op — embed/search/delete still work, TTL pruning just can't find anything to prune
- Connection: `QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"))`

**Docker:** Qdrant sidecar service in `docker-compose.yml`:

```yaml
qdrant:
  image: qdrant/qdrant:latest
  volumes:
    - gitmind_qdrant:/qdrant/storage
  ports:
    - "6333:6333"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
  restart: unless-stopped
```

**HF Spaces constraint:** Only runs single container — set `QDRANT_URL` env var to external Qdrant instance (Qdrant Cloud free tier or self-hosted).

**Files changed:**

| File                          | Action (as implemented)                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `backend/qdrant_utils.py`     | NEW — parallel to chroma_utils, not a replacement                                |
| `backend/vector_store.py`     | NEW — facade, dispatches to chroma_utils or qdrant_utils based on `QDRANT_URL`    |
| `backend/chroma_utils.py`     | KEPT — still the default, unchanged                                              |
| `backend/agents/rag_setup.py` | Import swap: `chroma_utils` → `vector_store`                                      |
| `backend/agents/chat.py`      | Import swap: `chroma_utils` → `vector_store`                                      |
| `backend/routes/analysis.py`  | Import swap: `chroma_utils` → `vector_store`                                      |
| `backend/routes/fix.py`       | Import swap: `chroma_utils` → `vector_store`                                      |
| `backend/main.py`             | Import swap: `chroma_utils` → `vector_store` (+ health check reports active backend) |
| `backend/requirements.txt`    | `chromadb==1.5.9` kept; added `qdrant-client==1.19.0`, `fastembed==0.8.0`         |
| `docker-compose.yml`          | Added `qdrant` service; kept `gitmind_chroma` volume (unused once `QDRANT_URL` is set, harmless if not) |
| `Dockerfile`                  | Added fastembed model pre-download alongside the existing ChromaDB one — and fixed both: neither cache was actually being copied into the final image before this pass, so both re-downloaded on first use in production regardless |

---

### 2. Task Queue → Redis List

**File:** `backend/services/task_queue.py`

**Current:** `asyncio.Queue` + in-memory `_tasks` dict + Redis sync persistence as side effect.

**New:**

- `submit()` → `redis.lpush("task_queue", task_id)` + `redis.hset(f"task:{task_id}", ...)` + `redis.expire(f"task:{task_id}", 600)`
- `_worker()` → each worker `await redis.brpop("task_queue", timeout=0)`, looks up task hash, executes, updates result
- `get_task()` → `redis.hgetall(f"task:{task_id}")` — no in-memory dict
- Retry logic → re-queues via `redis.lpush`
- Remove: `_tasks`, `_prune_old()`, `_periodic_prune()`, `_persist_task()`
- Keep: Prometheus counters, `asyncio.wait_for` timeout, N worker asyncio tasks

**Edge cases:**

- Redis unavailable mid-task → marks task as failed (safe-fail)
- Task IDs survive worker restart
- Polling works from any worker

---

### 3. LLM Cache → Redis Primary

**File:** `backend/llm_cache.py`

```python
def get_cached(model: str, prompt: str) -> str | None:
    r = get_redis()
    if r:
        val = r.get(f"llm_cache:{_key(model, prompt)}")
        if val:
            return val
    return _cache.get(_key(model, prompt))  # diskcache fallback

def set_cached(model: str, prompt: str, response: str, ttl=86400) -> None:
    r = get_redis()
    if r:
        r.setex(f"llm_cache:{_key(model, prompt)}", ttl, response)
    _cache.set(_key(model, prompt), response, expire=ttl)
```

**Why keep diskcache:** Local dev without Redis still works. Production with Redis gets shared cache.

---

### 4. Session Store → Redis-Only

**File:** `backend/services/session.py`

**Current:** `put_session()` writes to Redis + `OrderedDict` (500 cap). `get_session()` checks Redis → memory → DB.

**New:**

- Remove: `_sessions`, `_MAX_SESSIONS`, entire `OrderedDict` pattern
- `put_session()` → writes to Redis only. Raises `RuntimeError` if Redis unavailable (safe-fail)
- `get_session()` → reads from Redis. Falls back to PostgreSQL if not found
- DB restore re-caches into Redis via `put_session()`

---

### 5. Rate Limiter → Redis-Only

**File:** `backend/services/rate_limiter.py`

**Current:** `_redis_rate_check()` with `_mem_rate_check()` fallback. `rate_ok()` (sync) ignores Redis entirely.

**New:**

- Remove: `_mem_data`, `_mem_lock`, `_mem_rate_check()`, `rate_ok()` entirely
- `check_rate_limit()` → requires Redis. Denies all requests if Redis unavailable (safe-fail)
- `_redis_rate_check()` → remove `except` fallback to memory
- `rate_ok()` → deleted. All callers already use `check_rate_limit()` (async). No production code uses `rate_ok()` — only tests

---

### 6. Redis Connection Resiliency

**File:** `backend/services/cache.py`

- Add retry: `init_redis()` retries connection 3 times with 2s delay
- Add `ENVIRONMENT` env var: if `ENVIRONMENT=production` and Redis unavailable, `init_redis()` raises `RuntimeError` (fail fast)
- Increase default `max_connections` from 20 → 50
- Health check: when `ENVIRONMENT=production`, Redis must be up for `/health` to return `"ok"`

---

### 7. Docker Compose Changes

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - gitmind_qdrant:/qdrant/storage
    ports:
      - "6333:6333"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  app:
    environment:
      QDRANT_URL: http://qdrant:6333
      ENVIRONMENT: production
    depends_on:
      qdrant:
        condition: service_healthy

volumes:
  gitmind_qdrant: # NEW
  # gitmind_chroma — REMOVED
```

---

### 8. Requirements Changes

```
- chromadb==1.5.9
+ qdrant-client>=1.11.0
+ fastembed>=0.3.0
```

---

## Implementation Order

```
1.  qdrant_utils.py            ← NEW (no dependencies)
2.  docker-compose.yml          ← ADD qdrant service
3.  requirements.txt            ← SWAP chromadb → qdrant-client + fastembed
4.  Dockerfile                  ← UPDATE model pre-cache
5.  agents/rag_setup.py         ← IMPORT swap
6.  agents/chat.py              ← IMPORT swap
7.  routes/analysis.py          ← IMPORT swap
8.  routes/fix.py               ← IMPORT swap
9.  main.py                     ← IMPORT swap
10. chroma_utils.py             ← DELETE
11. services/cache.py           ← ADD retry + ENVIRONMENT check
12. services/task_queue.py      ← REWRITE (Redis List)
13. services/session.py         ← REWRITE (remove in-memory LRU)
14. services/rate_limiter.py    ← EDIT (remove memory fallback)
15. llm_cache.py                ← EDIT (add Redis tier)
16. Tests                       ← UPDATE for Redis-only mode
```

Steps 1-10 (Qdrant migration) can be done in one pass. Steps 11-15 independently. Step 16 last.

---

## Tests Added

The gate means existing tests (memory-fallback behavior) didn't need to
change — only new tests for the opt-in path were needed:

| File                                 | What                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `backend/tests/test_qdrant_utils.py`  | Qdrant backend, against an in-memory `QdrantClient`           |
| `backend/tests/test_vector_store.py`  | Facade picks chroma vs qdrant based on `QDRANT_URL`            |
| `backend/tests/test_require_redis.py` | `REQUIRE_REDIS=true` fail-closed behavior for cache/rate_limiter/session, and that the gate being off preserves today's fallback behavior |
| `backend/tests/test_routes.py`        | Updated: `/health`'s debug block now reports `vector_store_{backend}` instead of a hardcoded `chromadb` key |

`test_rate_limiter.py`, `test_session.py`, and `test_task_queue.py` were left
unchanged — the memory-fallback paths they test are still the default.

---

## Open Questions

Narrowed to one now that the code exists behind a gate:

1. **When to flip `REQUIRE_REDIS=true` / set `QDRANT_URL` on the Hugging Face
   Spaces deployment specifically** — that single container has neither
   Redis nor Qdrant today. Options: an external managed Redis (Upstash /
   Redis Cloud free tier) + Qdrant Cloud free tier, or accept HF Spaces
   stays on today's single-process behavior until it's worth the
   infra/cost to change. The self-host `docker-compose.yml` path already
   has both gates on, since it already has a real Redis and now a Qdrant
   service.
2. **ChromaDB data:** Old `.chroma/` collections orphaned if/when `QDRANT_URL`
   is eventually set everywhere — OK to delete? (7-day TTL prunes them
   either way.)

---

## Next Steps (Post Phase 0)

After Phase 0, the system can handle multiple workers. Remaining phases:

- **Phase 1:** Worker tier (Celery), PostgreSQL read replicas, object storage for cloned repos
  - **2026-09 update — re-scoped, partially done:** the Redis-list task
    queue (`services/task_queue.py`, hardened further with a crash-recovery
    reaper) already does what a Celery tier was meant to provide here — a
    real Celery migration would replace working, tested code for no
    functional gain and isn't planned. Read replicas remain pure
    infrastructure (an actual second Postgres instance to provision — no
    code to write until you have one). Object storage for cloned repos
    turned out to have no real use case as originally scoped either —
    nothing in this codebase runs agents as independently-distributed
    workers that would need to share a clone (a single task queue entry is
    the *entire* clone-through-9-agents pipeline, run by one worker,
    in-process). It's implemented instead as a narrower, real optimization:
    `services/clone_cache.py` caches shallow-clone bundles in S3-compatible
    storage keyed by repo+SHA, avoiding a redundant GitHub clone when the
    same commit is fetched twice (PR impact re-triggered, an org-audit
    overlapping an already-analyzed repo). Gated on `CLONE_CACHE_BUCKET` —
    unset, `agents/scanner.py` behaves exactly as before.
- **Phase 2:** Auth system (OAuth2), DB normalization, frontend state management
- **Phase 3:** Autoscaling, read replicas, CQRS, regional deployment
  - **2026-09 update — re-scoped:** read replicas done —
    `services/database.py`'s `DATABASE_READ_REPLICA_URL` routes the 4
    read-only query functions (`get_analysis_db`, `get_sha_index_entry`,
    `get_previous_analysis_db`, `get_analysis_history_db`) to a replica
    engine when set; every write stays on `DATABASE_URL` unconditionally.
    Unset (default) = no behavior change. Autoscaling, CQRS, and regional
    deployment are not implemented — no concrete pain point was identified
    behind them, and none has a code deliverable without an actual
    infrastructure decision (a target platform for autoscaling, a real
    multi-region hosting setup, a specific read/write bottleneck to justify
    CQRS) that's this project's call to make, not something to build
    speculatively.
- **Phase 4:** Cost optimization (LLM caching, pre-computation, tiered models)
  - **2026-09 update:** LLM caching was already done (Redis + diskcache,
    `llm_cache.py`). Tiered models done too — `settings.LLM_MODEL_CHEAP`
    routes `agents/api_doc.py` and `agents/language_audit.py` (high-volume,
    low-judgment extraction/triage of already-deterministic input) to a
    cheaper model; everything security-critical or user-facing-quality-critical
    (chat, fix, PR review, security/Solidity triage, incident reports, the
    executive summary) stays on `LLM_MODEL`. Pre-computation has no concrete
    target identified yet — still open.
