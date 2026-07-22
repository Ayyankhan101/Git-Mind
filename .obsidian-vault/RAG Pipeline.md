---
title: "RAG Pipeline"
tags: [gitmind, rag, architecture]
---

# RAG Pipeline

Git-Mind uses hybrid search (Vector + BM25 + RRF + Reranker) for codebase Q&A.

## Components

- `backend_agents_rag_setup` — rag_setup.py
- `backend_agents_rag_setup_run_rag_setup` — run_rag_setup()
- `backend_chroma_utils` — chroma_utils.py
- `backend_chroma_utils_writable` — _writable()
- `backend_chroma_utils_separators_for` — _separators_for()
- `backend_chroma_utils_load_registry` — _load_registry()
- `backend_chroma_utils_save_registry` — _save_registry()
- `backend_chroma_utils_register_collection` — _register_collection()
- `backend_chroma_utils_embed_codebase` — embed_codebase()
- `backend_chroma_utils_search_codebase` — search_codebase()
- `backend_chroma_utils_rrf_fuse` — _rrf_fuse()
- `backend_chroma_utils_delete_collection` — delete_collection()
- `backend_chroma_utils_prune_old_collections` — prune_old_collections()
- `backend_chroma_utils_rationale_34` — Return True if path (or its parent) is writable by the current process.
- `backend_chroma_utils_rationale_66` — Return language-appropriate chunking separators for a file.

---
Part of [[Git-Mind Graph]]