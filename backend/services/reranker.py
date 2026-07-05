"""Cross-encoder reranker service for RAG retrieval.

After ChromaDB returns *n* candidate chunks, a cross-encoder scores each
(chunk, query) pair and keeps only the top-*k* with the highest relevance.
This dramatically improves precision — chunks that are semantically similar
to the query but irrelevant to the specific question get downranked.

The model is loaded lazily on first use so import time is not affected.

Environment variables:
    RERANKER_MODEL — override the default cross-encoder model name.
"""

from __future__ import annotations

import logging
import os
from hashlib import sha256

logger = logging.getLogger(__name__)

_MODEL_NAME = os.environ.get("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
_reranker = None  # lazy singleton


def _get_reranker():
    global _reranker
    if _reranker is None:
        try:
            from sentence_transformers import CrossEncoder

            _reranker = CrossEncoder(_MODEL_NAME)
            logger.info("Loaded cross-encoder reranker: %s", _MODEL_NAME)
        except ImportError:
            logger.warning(
                "sentence-transformers not installed — reranker disabled. "
                "Install with: pip install sentence-transformers"
            )
            return None
    return _reranker


def rerank(
    query: str,
    candidates: list[dict],
    top_k: int = 8,
    score_threshold: float | None = None,
) -> list[dict]:
    """Rerank *candidates* (list of dicts with 'content' key) by relevance.

    Returns the top *top_k* candidates sorted by descending cross-encoder score.
    Each candidate dict is augmented with a ``'rerank_score'`` key.

    If the cross-encoder model is not available (sentence-transformers not
    installed), the original candidates are returned unchanged.
    """
    if not candidates:
        return []

    model = _get_reranker()
    if model is None:
        return candidates[:top_k]

    pairs = [(query, c.get("content", "")) for c in candidates]
    scores = model.predict(pairs, show_progress_bar=False)

    ranked = []
    for candidate, score in zip(candidates, scores, strict=False):
        item = {**candidate, "rerank_score": float(score)}
        if score_threshold is not None and item["rerank_score"] < score_threshold:
            continue
        ranked.append(item)
    ranked.sort(key=lambda x: x["rerank_score"], reverse=True)

    return ranked[:top_k]


def rerank_cache_key(query: str, candidate_fps: list[str]) -> str:
    """Generate a cache key for a reranking result."""
    payload = f"{query}::{'|'.join(candidate_fps)}"
    return sha256(payload.encode()).hexdigest()
