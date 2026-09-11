# Cython Backend Analysis

## Executive Summary

**Recommendation: Status Quo (no Cython needed)**

The backend already delegates CPU-bound work to Rust (`gitmind_core` via PyO3). Remaining Python code is IO-bound (LLM calls, network, subprocess). Cython only accelerates CPU-bound code — it won't help here.

---

## Architecture Overview

```
FastAPI (Python)          → Orchestration, routing, middleware
LangGraph (Python)        → Agent workflow orchestration
gitmind_core (Rust/PyO3)  → CPU-bound: dep parsing, file scanning, text splitting, blame
sentence-transformers     → Reranker (C++ backend via PyTorch)
semgrep                   → Security scanning (subprocess)
Groq API                  → LLM inference (network)
```

## What's Already in Rust (`gitmind_core`)

| Function | Used By | CPU-Bound? |
|----------|---------|------------|
| `parse_dependencies` | cve_scanner.py | Yes |
| `scan_secrets` | git_audit.py | Yes |
| `scan_sensitive_files` | git_audit.py | Yes |
| `scan_route_files` | api_doc.py | Yes |
| `compute_docs_score` | health.py | Yes |
| `split_text` | rag_setup.py | Yes |
| `split_files` | rag_setup.py | Yes |
| `batch_blame` | blame.py | Yes |

## Remaining Python Code Analysis

### CPU-Bound Candidates (NOT in Rust)

| Module | Lines | CPU-Bound? | In Hot Path? | Cython Worth It? |
|--------|-------|------------|--------------|------------------|
| `bm25_index.py` | 147 | Yes (regex, FTS5) | Yes (RAG) | No — SQLite FTS5 already C-optimized |
| `reranker.py` | 75 | Yes (model inference) | Yes (RAG) | No — sentence-transformers uses PyTorch/C++ |
| `parsers/python_parser.py` | 322 | Yes (AST, regex) | No (once per analysis) | No — not frequent enough |
| `parsers/fallback_parser.py` | 133 | Yes (regex) | No (once per analysis) | No — not frequent enough |
| `agents/graph_analyzer.py` | 121 | Yes (graph building) | No (once per analysis) | No — not frequent enough |
| `scanner.py` | 303 | Partially (file walk) | Yes | No — file walk is IO-bound |

### IO-Bound Code (Dominates Hot Path)

| Component | Time | Bound Type |
|-----------|------|------------|
| LLM calls (Groq API) | 1-10s | Network |
| semgrep subprocess | 2-5s | Subprocess |
| OSV.dev HTTP | 1-2s | Network |
| git clone | 5-15s | Network |
| git ls-remote | 1-2s | Network |
| Redis/DB operations | 10-100ms | IO |

**Total analysis time**: ~30-60s  
**CPU-bound Python time**: <1s (estimated)  
**IO-bound time**: ~30-59s

## Cython vs Rust vs Status Quo

| Factor | Cython | Rust (PyO3) | Status Quo |
|--------|--------|-------------|------------|
| Migration effort | Low (compile .py → .c) | Medium (rewrite) | None |
| Performance gain | 2-10x for CPU-bound | 10-100x for CPU-bound | N/A |
| GIL removal | Extra work needed | Native | N/A |
| Already integrated | No | Yes (`gitmind_core`) | Yes |
| Addresses bottleneck? | No (IO-bound) | No (IO-bound) | Yes |

## Key Insight

The architecture is already optimized:
1. **CPU-bound work** → delegated to Rust (`gitmind_core`)
2. **IO-bound work** → stays in Python (async/await)
3. **Model inference** → uses C++ backends (PyTorch, sentence-transformers)

Cython would add complexity without meaningful performance gains.

## If You Still Want Optimization

Focus on IO-bound bottlenecks instead:
1. **LLM calls**: Use faster models, batch requests, increase cache hit rate
2. **Network**: Connection pooling, retry budgets, CDN for static assets
3. **Subprocess**: Cache semgrep results, incremental scanning
4. **Redis/DB**: Connection pooling, batch operations

## Files Analyzed

- `backend/agents/scanner.py` (303 lines)
- `backend/agents/cve_scanner.py` (116 lines)
- `backend/agents/security.py` (200 lines)
- `backend/agents/architecture.py` (352 lines)
- `backend/agents/chat.py` (137 lines)
- `backend/agents/graph_builder.py` (31 lines)
- `backend/agents/graph_analyzer.py` (121 lines)
- `backend/parsers/python_parser.py` (322 lines)
- `backend/parsers/fallback_parser.py` (133 lines)
- `backend/parsers/router.py` (36 lines)
- `backend/services/bm25_index.py` (147 lines)
- `backend/services/reranker.py` (75 lines)
- `backend/services/sha_cache.py` (43 lines)
- `backend/vectors/chroma_utils.py` (486 lines)
- `backend/routes/analyze.py` (189 lines)
- `backend/app/orchestrator.py` (307 lines)
- `backend/app/main.py` (481 lines)
- `rust-gitmind/src/lib.rs` (19 lines)
