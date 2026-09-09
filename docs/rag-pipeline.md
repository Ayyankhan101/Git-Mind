# RAG Pipeline


The codebase chat (`POST /chat`) uses a multi-stage retrieval pipeline:

```
User question
    ↓
ChromaDB vector search (top-20)
    ↓
BM25 keyword search via SQLite FTS5 (top-20)   ← zero external deps, built-in
    ↓
Reciprocal Rank Fusion (RRF)                    ← merges both result sets
    ↓
Cross-encoder reranker (configurable model)      ← re-scores by relevance
    ↓
Context dedup (filepath + content prefix)        ← multiple chunks per file
    ↓
Qwen3.6-27B via Groq                             ← generates answer with citations
```

### What each layer does

| Layer                      | What it does                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **ChromaDB (vector)**      | Semantic similarity search using `all-MiniLM-L6-v2` embeddings                          |
| **BM25 (FTS5)**            | SQLite FTS5 — exact term matching with zero external dependencies                       |
| **RRF fusion**             | Combines rank positions from both searchers; weighted blend (default 70/30 vector/BM25) |
| **Cross-encoder reranker** | `cross-encoder/ms-marco-MiniLM-L-6-v2` (configurable via `RERANKER_MODEL` env var)      |
| **Context dedup**          | Allows multiple chunks per file (dedup by filepath + content prefix, not filepath-only) |
| **LLM cache**              | `diskcache` (SQLite, 2 GB, 24h TTL) — instant return for repeated questions             |

### Chunking

- **Chunk size:** 800 chars / 120 overlap (15%)
- **Language-aware separators:** `.py` splits on `class`/`def`; `.js/.ts` on `export`/`function`/`class`; `.go` on `func`/`type`; `.rs` on `fn`/`struct`/`impl`
- **Rust acceleration:** `gitmind_core.split_files()` (PyO3) — 10-20x faster than Python fallback

### LLM Output Reliability

- **Structured JSON outputs:** Summary, PR review, security triage, code audit, and incident report all use `response_format={"type": "json_object"}`
- **Parse retry:** `invoke_json_with_retry()` retries up to 2x on JSON parse failure (bypasses stale cache on retries)
- **Centralized model config:** All agents use `get_llm()` from `settings.py` — single source of truth for model name and temperature
