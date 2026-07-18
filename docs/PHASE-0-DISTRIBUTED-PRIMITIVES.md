# Phase 0: Distributed Primitives + Qdrant Migration

## Status: PLANNED — Not Yet Implemented

**Goal:** Fix the 5 immediate blockers that crash or silently break under >1 concurrent user.

---

## Overview

The current architecture is a single-process monolith with in-memory singletons (task queue, session store, rate limiter, LLM cache, vector DB). These break when:

- Multiple uvicorn workers are spawned
- The process restarts (tasks lost, sessions lost)
- The process is restarted under load

**Phase 0 makes Redis required for production and replaces local ChromaDB with Qdrant.**

---

## The 5 Blockers

| #   | Blocker                  | Current                                                      | Fix                                 |
| --- | ------------------------ | ------------------------------------------------------------ | ----------------------------------- |
| 1   | **Task Queue**           | `asyncio.Queue` in-process — lost on restart, single-process | Redis List (`LPUSH`/`BRPOP`)        |
| 2   | **Vector DB (ChromaDB)** | `PersistentClient` — file-locked, crashes with >1 worker     | Qdrant sidecar (HTTP API)           |
| 3   | **LLM Cache**            | `diskcache` — file-locked, per-process duplicate             | Redis primary + diskcache fallback  |
| 4   | **Rate Limiter**         | In-memory `defaultdict` per-process                          | Redis-only (remove memory fallback) |
| 5   | **Session Store**        | In-memory `OrderedDict` (500 cap)                            | Redis-only + DB fallback            |

---

## Detailed Plan

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
- Registry file (`.qdrant_registry.json`) tracks creation times for TTL pruning
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

| File                          | Action                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| `backend/qdrant_utils.py`     | NEW — replacement for chroma_utils                                  |
| `backend/chroma_utils.py`     | DELETE                                                              |
| `backend/agents/rag_setup.py` | Import swap: `chroma_utils` → `qdrant_utils`                        |
| `backend/agents/chat.py`      | Import swap: `chroma_utils` → `qdrant_utils`                        |
| `backend/routes/analysis.py`  | Import swap: `chroma_utils` → `qdrant_utils`                        |
| `backend/routes/fix.py`       | Import swap: `chroma_utils` → `qdrant_utils`                        |
| `backend/main.py`             | Import swap: `chroma_utils` → `qdrant_utils`                        |
| `backend/requirements.txt`    | `chromadb==1.5.9` → `qdrant-client>=1.11.0`, add `fastembed>=0.3.0` |
| `docker-compose.yml`          | Add `qdrant` service, remove `gitmind_chroma` volume                |
| `backend/Dockerfile`          | Replace ChromaDB ONNX pre-download with fastembed model             |

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

## Tests to Update

| File                                 | What                                          |
| ------------------------------------ | --------------------------------------------- |
| `backend/tests/test_rate_limiter.py` | Remove `rate_ok` tests, update for Redis-only |
| `backend/tests/test_session.py`      | Remove in-memory LRU tests                    |
| `backend/tests/test_task_queue.py`   | Update for Redis-based queue                  |

---

## Open Questions

1. **HF Spaces:** Qdrant needs external instance (HF runs single container). Use Qdrant Cloud free tier or external self-hosted?
2. **Redis on HF Spaces:** Currently runs without Redis. Add Redis to compose? Or use external (Upstash/Redis Cloud)?
3. **ChromaDB data:** Old `.chroma/` collections orphaned — OK to delete? (7-day TTL anyway.)
4. **Commit strategy:** Single large commit or incremental (Qdrant first, then Redis primitives)?

---

## Next Steps (Post Phase 0)

After Phase 0, the system can handle multiple workers. Remaining phases:

- **Phase 1:** Worker tier (Celery), PostgreSQL read replicas, object storage for cloned repos
- **Phase 2:** Auth system (OAuth2), DB normalization, frontend state management
- **Phase 3:** Autoscaling, read replicas, CQRS, regional deployment
- **Phase 4:** Cost optimization (LLM caching, pre-computation, tiered models)
