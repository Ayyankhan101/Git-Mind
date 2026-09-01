"""BM25 keyword index for hybrid RAG retrieval using SQLite FTS5.

Provides a lightweight BM25 index built from ChromaDB collection documents.
When combined with vector search via reciprocal rank fusion (RRF), this
catches exact identifier and function-name matches that vector-only search
misses.

Uses SQLite FTS5 (built into Python) instead of the rank_bm25 package.
The index is rebuilt lazily from ChromaDB on first search query per collection
and cached in memory for the lifetime of the process.
"""

from __future__ import annotations

import contextlib
import re
import sqlite3
import threading
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    import chromadb

logger = structlog.get_logger(__name__)

# ── Tokeniser ──────────────────────────────────────────────────────────────

# Split on non-alphanumeric characters; lowercase everything.
_TOKEN_RE = re.compile(r"[a-zA-Z0-9_]{2,}", re.UNICODE)


def _tokenise(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


# ── Index cache ────────────────────────────────────────────────────────────

_bm25_cache: dict[str, _BM25Index] = {}
_cache_lock = threading.Lock()


def _get_or_build(collection) -> _BM25Index | None:
    """Return cached FTS5 index for a ChromaDB collection, or build one."""
    name = collection.name
    with _cache_lock:
        if name in _bm25_cache:
            return _bm25_cache[name]

    try:
        data = collection.get(include=["documents", "metadatas"])
        docs = data.get("documents") or []
        metas = data.get("metadatas") or []

        if not docs:
            return None

        # Build SQLite FTS5 index in memory
        conn = sqlite3.connect(":memory:", check_same_thread=False)
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(id, filepath, content)"
        )

        rows = []
        for i, (doc, meta) in enumerate(zip(docs, metas, strict=False)):
            fp = meta.get("filepath", f"unknown_{i}")
            # FTS5 tokenises content automatically; we also store filepath for retrieval
            rows.append((str(i), fp, doc))

        conn.executemany(
            "INSERT INTO docs(id, filepath, content) VALUES (?, ?, ?)", rows
        )
        conn.commit()

        index = _BM25Index(conn, docs, metas)
        with _cache_lock:
            _bm25_cache[name] = index
        logger.debug("Built FTS5 BM25 index for '%s' (%d docs)", name, len(docs))
        return index
    except Exception as exc:
        logger.warning("Failed to build BM25 index: %s", exc)
        return None


def invalidate(collection_name: str) -> None:
    """Drop cached BM25 index for a collection (called after re-embedding)."""
    with _cache_lock:
        idx = _bm25_cache.pop(collection_name, None)
    if idx is not None:
        with contextlib.suppress(Exception):
            idx.conn.close()


def bm25_search(
    collection: chromadb.Collection,
    query: str,
    n_results: int = 8,
) -> list[dict]:
    """Search using BM25 keyword matching via SQLite FTS5.

    Returns a list of dicts with ``filepath``, ``content``, and ``bm25_score`` keys.
    """
    index = _get_or_build(collection)
    if index is None:
        return []

    tokens = _tokenise(query)
    if not tokens:
        return []

    # FTS5 match query: OR all tokens for broad recall
    match_query = " OR ".join(tokens)

    try:
        # Use FTS5 bm25() ranking function — lower score = more relevant
        rows = index.conn.execute(
            "SELECT filepath, content, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?",
            (match_query, n_results),
        ).fetchall()
    except Exception:
        # FTS5 match syntax error — fallback to simple LIKE search
        like_pattern = f"%{tokens[0]}%"
        rows = index.conn.execute(
            "SELECT filepath, content, 0.0 FROM docs WHERE content LIKE ? LIMIT ?",
            (like_pattern, n_results),
        ).fetchall()

    results = []
    for filepath, content, rank in rows:
        # bm25() returns negative scores (lower = better); negate for consistency
        results.append(
            {
                "filepath": filepath,
                "content": content,
                "bm25_score": -float(rank) if rank else 0.0,
            }
        )
    return results


# ── Internal container ─────────────────────────────────────────────────────


class _BM25Index:
    __slots__ = ("conn", "docs", "metas")

    def __init__(self, conn: sqlite3.Connection, docs: list[str], metas: list[dict]):
        self.conn = conn
        self.docs = docs
        self.metas = metas
