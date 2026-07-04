"""BM25 keyword index for hybrid RAG retrieval.

Provides a lightweight BM25 index built from ChromaDB collection documents.
When combined with vector search via reciprocal rank fusion (RRF), this
catches exact identifier and function-name matches that vector-only search
misses.

The index is rebuilt lazily from ChromaDB on first search query per collection
and cached in memory for the lifetime of the process.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import chromadb

logger = logging.getLogger(__name__)

# ── Tokeniser ──────────────────────────────────────────────────────────────

# Split on non-alphanumeric characters; lowercase everything.
_TOKEN_RE = re.compile(r"[a-zA-Z0-9_]{2,}", re.UNICODE)


def _tokenise(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


# ── Index cache ────────────────────────────────────────────────────────────

_bm25_cache: dict[str, _BM25Index] = {}
_cache_lock = threading.Lock()


def _get_or_build(collection) -> _BM25Index | None:
    """Return cached BM25 index for a ChromaDB collection, or build one."""
    name = collection.name
    with _cache_lock:
        if name in _bm25_cache:
            return _bm25_cache[name]

    try:
        from rank_bm25 import BM25Okapi

        data = collection.get(include=["documents", "metadatas"])
        docs = data.get("documents") or []
        metas = data.get("metadatas") or []

        if not docs:
            return None

        tokenised = [_tokenise(d) for d in docs]
        bm25 = BM25Okapi(tokenised)

        index = _BM25Index(bm25, docs, metas)
        with _cache_lock:
            _bm25_cache[name] = index
        logger.debug("Built BM25 index for '%s' (%d docs)", name, len(docs))
        return index
        logger.warning("rank_bm25 not installed — hybrid search disabled. Install with: pip install rank_bm25")
        return None
    except Exception as exc:
        logger.warning("Failed to build BM25 index: %s", exc)
        return None


def invalidate(collection_name: str) -> None:
    """Drop cached BM25 index for a collection (called after re-embedding)."""
    with _cache_lock:
        _bm25_cache.pop(collection_name, None)


def bm25_search(
    collection: chromadb.Collection,
    query: str,
    n_results: int = 8,
) -> list[dict]:
    """Search using BM25 keyword matching.

    Returns a list of dicts with ``filepath``, ``content``, and ``bm25_score`` keys.
    """
    index = _get_or_build(collection)
    if index is None:
        return []

    tokens = _tokenise(query)
    if not tokens:
        return []

    scores = index.bm25.get_scores(tokens)
    top_n = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:n_results]

    results = []
    for i in top_n:
        if scores[i] <= 0:
            continue
        results.append(
            {
                "filepath": index.metas[i].get("filepath", "unknown"),
                "content": index.docs[i],
                "bm25_score": float(scores[i]),
            }
        )
    return results


# ── Internal container ─────────────────────────────────────────────────────


class _BM25Index:
    __slots__ = ("bm25", "docs", "metas")

    def __init__(self, bm25, docs: list[str], metas: list[dict]):
        self.bm25 = bm25
        self.docs = docs
        self.metas = metas
