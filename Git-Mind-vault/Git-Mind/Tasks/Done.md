---
tags:
  - tasks
aliases: [Completed, Archive]
---

# Done

- [x] Initial project scaffolding
- [x] Basic chat streaming (SSE)
- [x] RAG with ChromaDB
- [x] Rust git analysis
- [x] Docker compose setup
- [x] opencode Obsidian plugin installed
- [x] Obsidian vault structure for Git-Mind created
- [x] Vault color coding with CSS + Dataview
- [x] Phase 0: Redis hardening — cache.py (retry, fail-fast)
- [x] Phase 0: Redis hardening — task_queue.py (Redis List, registry)
- [x] Phase 0: Redis hardening — session.py (Redis hash, TTL)
- [x] Phase 0: Redis hardening — rate_limiter.py (sorted set + Lua)
- [x] Phase 0: Redis hardening — llm_cache.py (Redis + diskcache 2-tier)
- [x] Phase 0: requirements.txt — added orjson, opentelemetry deps
- [x] Gap fix: postChatStream sources callback (was dead code)
- [x] Gap fix: SSE /chat/stream now sends source metadata
- [x] Gap fix: JSON.parse try/catch in SSE reader
- [x] Gap fix: main.py sessions_active uses Redis SCARD
- [x] Gap fix: task_queue.py missing contextlib import
- [x] Gap fix: task_queue.py Callable type hint
- [x] Gap fix: chat agent returns source filepaths in stream
- [x] Gap fix: Streaming completion sets streaming=false

## Related

- [[Tasks/Current|Current]] — active work
- [[Tasks/Backlog|Backlog]] — future work
- [[Changelog/v0.1|Changelog]] — release notes
