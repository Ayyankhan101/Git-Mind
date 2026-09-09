"""Qdrant-backed vector store — drop-in replacement for chroma_utils.

Same public API as chroma_utils.py (embed_codebase, search_codebase,
delete_collection, prune_old_collections) so callers can switch backends via
services.vector_store without touching call sites.

Selected only when QDRANT_URL is set (see services/vector_store.py). Talks to
a real Qdrant server/sidecar rather than an embedded file-locked client, so
this is the piece of Phase 0 that lets multiple backend workers/replicas
share one vector index instead of each having its own local ChromaDB.

Embeddings are computed locally via fastembed (same all-MiniLM-L6-v2 model,
384 dims, as ChromaDB's built-in default) since Qdrant itself does not embed.
"""

import os
import tempfile
import threading
import time
import uuid
from collections.abc import Mapping
from pathlib import Path
from typing import Any, TypedDict, cast

import redis
import structlog
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from services.bm25_index import bm25_search
from services.bm25_index import invalidate as invalidate_bm25
from services.reranker import rerank

logger = structlog.get_logger(__name__)

_COLLECTION_TTL = 60 * 60 * 24 * 7  # 7 days
_VECTOR_SIZE = 384
_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_SCROLL_PAGE = 512


class SearchResult(TypedDict):
    filepath: str
    content: str
    language: str
    layer: str
    score: float


def _strip_context_header(content: str, filepath: str, meta: Mapping[str, Any]) -> str:
    header = f"[File: {filepath} | Lang: {meta.get('language', '')} | Layer: {meta.get('layer', '')}]\n"
    return content.replace(header, "")


def _candidate_key(filepath: str, content: str) -> str:
    return f"{filepath}::{hash(content)}"


def _writable(path: Path) -> bool:
    """Return True if path (or its parent) is writable by the current process."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write_test"
        probe.touch()
        probe.unlink()
        return True
    except OSError:
        return False


_client: QdrantClient | None = None
_embedder: Any = None

_lock: threading.Lock = threading.Lock()
_ready_collections: set[str] = set()
_embed_events: dict[str, threading.Event] = {}  # guards concurrent embeds


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        url = os.getenv("QDRANT_URL", "http://localhost:6333")
        _client = QdrantClient(url=url)
        logger.info("Qdrant client connected", url=url)
    return _client


# Anchored on the backend root, NOT on this file's own directory. Both
# Dockerfiles pre-download the ONNX weights into /app/.fastembed_cache, and
# /app is the backend root (they do `COPY backend/ .`). Resolving this
# relative to vectors/ would miss the baked cache and re-download the model
# at boot — the failure that took the HF Space down in 241a4fe.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_PREFERRED_FASTEMBED_CACHE = _BACKEND_ROOT / ".fastembed_cache"
if _writable(_PREFERRED_FASTEMBED_CACHE):
    _FASTEMBED_CACHE_DIR = str(_PREFERRED_FASTEMBED_CACHE)
else:
    _FASTEMBED_CACHE_DIR = str(Path(tempfile.gettempdir()) / "gitmind_fastembed_cache")


def _get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding

        _embedder = TextEmbedding(model_name=_EMBED_MODEL, cache_dir=_FASTEMBED_CACHE_DIR)
        logger.info("Loaded fastembed model: %s (cache_dir=%s)", _EMBED_MODEL, _FASTEMBED_CACHE_DIR)
    return _embedder


def _embed_one(text: str) -> list[float]:
    return next(iter(_get_embedder().embed([text]))).tolist()


def _embed_many(texts: list[str]) -> list[list[float]]:
    return [vec.tolist() for vec in _get_embedder().embed(texts)]


# ── Registry helpers (track collection creation times for TTL pruning) ─────────
#
# Backed by Redis instead of a local file: this module runs in ephemeral
# containers with no shared volume (see docker-compose.yml — the app service
# mounts nothing), so a local-file registry silently orphans every collection
# created before the container was last recreated, permanently defeating
# prune_old_collections. Redis is already required for any multi-worker
# Qdrant deployment (session store, rate limiter), so it's available whenever
# this actually matters. Uses a plain sync `redis` client — this module is
# intentionally sync (chromadb parity; callers already run it in a thread
# pool) while services.cache's shared client is asyncio-only.

_REGISTRY_KEY = "qdrant:collection_registry"
_registry_redis: "redis.Redis | None" = None
_registry_redis_checked = False


def _get_registry_redis() -> "redis.Redis | None":
    """Best-effort sync Redis client for the registry, or None if REDIS_URL
    isn't set / Redis isn't reachable. Absence just disables TTL pruning
    tracking (embed/search/delete all work fine without it)."""
    global _registry_redis, _registry_redis_checked
    if _registry_redis_checked:
        return _registry_redis
    _registry_redis_checked = True
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5)
        client.ping()
        _registry_redis = client
    except Exception as exc:
        logger.debug("registry Redis unavailable, pruning tracking disabled: %s", str(exc)[:120])
        _registry_redis = None
    return _registry_redis


def _load_registry() -> dict[str, float]:
    r = _get_registry_redis()
    if not r:
        return {}
    try:
        raw = cast("dict[str, str]", r.hgetall(_REGISTRY_KEY))
        return {name: float(ts) for name, ts in raw.items()}
    except Exception as exc:
        logger.debug("registry read failed: %s", exc)
        return {}


def _save_registry(reg: dict[str, float]) -> None:
    """Overwrite the full registry — used by tests to seed state directly."""
    r = _get_registry_redis()
    if not r:
        return
    try:
        r.delete(_REGISTRY_KEY)
        if reg:
            r.hset(_REGISTRY_KEY, mapping={name: str(ts) for name, ts in reg.items()})
    except Exception as exc:
        logger.debug("registry write failed: %s", exc)


def _register_collection(name: str) -> None:
    r = _get_registry_redis()
    if not r:
        return
    try:
        r.hset(_REGISTRY_KEY, name, str(time.time()))
    except Exception as exc:
        logger.debug("registry register failed: %s", exc)


def _unregister_collection(name: str) -> None:
    r = _get_registry_redis()
    if not r:
        return
    try:
        r.hdel(_REGISTRY_KEY, name)
    except Exception as exc:
        logger.debug("registry unregister failed: %s", exc)


# ── Language detection for metadata (mirrors chroma_utils) ─────────────────────

_EXT_TO_LANG = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "React",
    ".tsx": "React",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C",
    ".swift": "Swift",
    ".kt": "Kotlin",
}


def _detect_language(filepath: str) -> str:
    ext = "." + filepath.rsplit(".", 1)[-1].lower() if "." in filepath else ""
    return _EXT_TO_LANG.get(ext, "Unknown")


def _layer_from_path(filepath: str) -> str:
    lower = filepath.lower()
    if any(k in lower for k in ("frontend", "ui", "components", "pages", "views")):
        return "frontend"
    if any(k in lower for k in ("routes", "api", "endpoints")):
        return "api"
    if any(k in lower for k in ("models", "schemas", "entities")):
        return "models"
    if any(k in lower for k in ("services", "utils", "helpers")):
        return "services"
    if any(k in lower for k in ("tests", "test", "spec")):
        return "tests"
    return "backend"


def _chunk_file_with_context(
    filepath: str,
    content: str,
    splitter: RecursiveCharacterTextSplitter,
) -> list[tuple[str, dict]]:
    """Chunk a file and return (chunk_text, metadata) tuples."""
    language = _detect_language(filepath)
    layer = _layer_from_path(filepath)
    filename = filepath.rsplit("/", 1)[-1] if "/" in filepath else filepath

    chunks = []
    for i, chunk in enumerate(splitter.split_text(content)):
        context_header = f"[File: {filepath} | Lang: {language} | Layer: {layer}]\n"
        enriched_chunk = context_header + chunk

        metadata = {
            "filepath": filepath,
            "chunk_index": i,
            "language": language,
            "layer": layer,
            "filename": filename,
            "chunk_size": len(chunk),
        }
        chunks.append((enriched_chunk, metadata))

    return chunks


def _point_id(collection_name: str, filepath: str, chunk_index: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{collection_name}::{filepath}::{chunk_index}"))


# ── BM25 shim — presents a Qdrant collection as chroma-shaped for bm25_index ───


class _Bm25CollectionView:
    """Duck-types the subset of chromadb.Collection that services.bm25_index uses."""

    __slots__ = ("name", "_client")

    def __init__(self, name: str, client: QdrantClient):
        self.name = name
        self._client = client

    def get(self, include: list[str] | None = None) -> dict[str, list]:  # noqa: ARG002 — signature parity with chromadb.Collection.get
        records = _scroll_all(self._client, self.name)
        documents = [str(r.payload.get("document", "")) for r in records if r.payload]
        metadatas = [{k: v for k, v in (r.payload or {}).items() if k != "document"} for r in records]
        return {"documents": documents, "metadatas": metadatas}


def _scroll_all(client: QdrantClient, name: str) -> list:
    records: list = []
    offset = None
    while True:
        batch, offset = client.scroll(
            collection_name=name,
            limit=_SCROLL_PAGE,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        records.extend(batch)
        if offset is None:
            break
    return records


# ── Public API ─────────────────────────────────────────────────────────────────


def embed_codebase(file_contents: dict[str, str], collection_name: str) -> str:
    """Embed file_contents into a Qdrant collection with enhanced metadata.

    Thread-safe: concurrent calls for the same collection_name block until the
    first caller finishes, mirroring chroma_utils.embed_codebase.
    """
    client = get_client()

    with _lock:
        if collection_name in _ready_collections:
            logger.debug("Collection '%s' already ready — skipping", collection_name)
            return collection_name
        if collection_name in _embed_events:
            event: threading.Event = _embed_events[collection_name]
            should_embed = False
        else:
            event = threading.Event()
            _embed_events[collection_name] = event
            should_embed = True

    if not should_embed:
        logger.debug("Collection '%s' embedding in progress — waiting", collection_name)
        event.wait(timeout=120)
        return collection_name

    try:
        if not client.collection_exists(collection_name):
            client.create_collection(
                collection_name=collection_name,
                vectors_config=qmodels.VectorParams(size=_VECTOR_SIZE, distance=qmodels.Distance.COSINE),
            )

        existing = client.count(collection_name, exact=False).count
        if existing > 0:
            logger.debug("Collection '%s' has %d points — skipping re-embed", collection_name, existing)
        else:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=600,
                chunk_overlap=100,
                separators=[
                    "\nclass ",
                    "\ndef ",
                    "\nasync def ",
                    "\nexport ",
                    "\nimport ",
                    "\nconst ",
                    "\nfunction ",
                    "\n\n",
                    "\n",
                    " ",
                ],
            )

            all_chunks: list[str] = []
            all_metas: list[dict] = []
            all_ids: list[str] = []

            for fp, content in file_contents.items():
                for chunk_text, meta in _chunk_file_with_context(fp, content, splitter):
                    all_chunks.append(chunk_text)
                    all_metas.append(meta)
                    all_ids.append(_point_id(collection_name, fp, meta["chunk_index"]))

            for i in range(0, len(all_chunks), 100):
                batch_docs = all_chunks[i : i + 100]
                batch_metas = all_metas[i : i + 100]
                batch_ids = all_ids[i : i + 100]
                vectors = _embed_many(batch_docs)

                client.upsert(
                    collection_name=collection_name,
                    points=[
                        qmodels.PointStruct(id=pid, vector=vec, payload={**meta, "document": doc})
                        for pid, vec, doc, meta in zip(batch_ids, vectors, batch_docs, batch_metas, strict=False)
                    ],
                )

            logger.info(
                "Embedded %d chunks from %d files into '%s' (qdrant)",
                len(all_chunks),
                len(file_contents),
                collection_name,
            )

        with _lock:
            _ready_collections.add(collection_name)
        _register_collection(collection_name)

    except Exception:
        with _lock:
            _ready_collections.discard(collection_name)
        raise

    finally:
        with _lock:
            evt = _embed_events.pop(collection_name, None)
        if evt:
            evt.set()

    return collection_name


def search_codebase(
    collection_name: str,
    query: str,
    n_results: int = 5,
    layer_filter: str | None = None,
    language_filter: str | None = None,
) -> list[SearchResult]:
    """Search with optional metadata filtering and enhanced scoring (Qdrant-backed)."""
    client = get_client()

    with _lock:
        ready = collection_name in _ready_collections
        event = _embed_events.get(collection_name) if not ready else None

    if event is not None:
        logger.debug("search_codebase: waiting for '%s' to finish embedding", collection_name)
        event.wait(timeout=30)

    if not client.collection_exists(collection_name):
        logger.warning("Collection '%s' not found in Qdrant", collection_name)
        return []

    count = client.count(collection_name, exact=False).count
    if count == 0:
        return []

    # list[Any]: qmodels.Filter.must's declared type is an invariant list of a
    # broad condition union — list[FieldCondition] doesn't satisfy it even
    # though FieldCondition is a member (see mypy's list-invariance docs).
    conditions: list[Any] = []
    if layer_filter:
        conditions.append(qmodels.FieldCondition(key="layer", match=qmodels.MatchValue(value=layer_filter)))
    if language_filter:
        conditions.append(qmodels.FieldCondition(key="language", match=qmodels.MatchValue(value=language_filter)))
    query_filter = qmodels.Filter(must=conditions) if conditions else None

    n = min(max(n_results * 2, 10), count)
    query_vector = _embed_one(query)
    response = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        query_filter=query_filter,
        limit=n,
        with_payload=True,
    )

    vector_candidates: list[dict[str, Any]] = []
    for rank, point in enumerate(response.points, start=1):
        meta = point.payload or {}
        filepath = str(meta.get("filepath", ""))
        chunk_size_raw = meta.get("chunk_size", 0)
        chunk_size = chunk_size_raw if isinstance(chunk_size_raw, (int, float)) else 0
        vector_score = float(point.score) * (1.0 + min(chunk_size / 1000, 0.5))
        vector_candidates.append(
            {
                "filepath": filepath,
                "content": _strip_context_header(str(meta.get("document", "")), filepath, meta),
                "language": str(meta.get("language", "")),
                "layer": str(meta.get("layer", "")),
                "score": vector_score,
                "vector_rank": rank,
            }
        )

    bm25_candidates: list[dict[str, Any]] = []
    try:
        raw_bm25 = bm25_search(cast(Any, _Bm25CollectionView(collection_name, client)), query, n_results=n)
        for rank, item in enumerate(raw_bm25, start=1):
            filepath = str(item.get("filepath", ""))
            content = str(item.get("content", ""))
            bm25_candidates.append(
                {
                    "filepath": filepath,
                    "content": content,
                    "language": _detect_language(filepath),
                    "layer": _layer_from_path(filepath),
                    "bm25_score": float(item.get("bm25_score", 0.0)),
                    "bm25_rank": rank,
                }
            )
    except Exception as exc:
        logger.debug("BM25 search unavailable: %s", str(exc)[:120])

    # Reciprocal rank fusion: combine vector + BM25 candidates
    fused: dict[str, dict[str, Any]] = {}
    for candidate in vector_candidates:
        key = _candidate_key(candidate["filepath"], candidate["content"])
        fused[key] = {
            **candidate,
            "hybrid_score": 1.0 / (60 + candidate["vector_rank"]),
        }
    for candidate in bm25_candidates:
        key = _candidate_key(candidate["filepath"], candidate["content"])
        existing = fused.get(key, candidate)
        existing["hybrid_score"] = existing.get("hybrid_score", 0.0) + 1.0 / (60 + candidate["bm25_rank"])
        existing.setdefault("filepath", candidate["filepath"])
        existing.setdefault("content", candidate["content"])
        existing.setdefault("language", candidate["language"])
        existing.setdefault("layer", candidate["layer"])
        fused[key] = existing

    ranked_candidates = sorted(
        fused.values(),
        key=lambda x: float(x.get("hybrid_score", x.get("score", 0.0))),
        reverse=True,
    )

    reranked = rerank(query, ranked_candidates, top_k=max(n_results * 2, 8))

    results: list[SearchResult] = []
    seen_files = set()
    for candidate in reranked:
        filepath = str(candidate.get("filepath", ""))
        if filepath in seen_files:
            continue
        seen_files.add(filepath)
        results.append(
            {
                "filepath": filepath,
                "content": str(candidate.get("content", "")),
                "language": str(candidate.get("language", "")),
                "layer": str(candidate.get("layer", "")),
                "score": float(
                    candidate.get(
                        "rerank_score",
                        candidate.get("hybrid_score", candidate.get("score", 0.0)),
                    )
                ),
            }
        )

    results.sort(key=lambda x: cast(float, x["score"]), reverse=True)
    return results[:n_results]


def collection_exists(name: str) -> bool:
    """Whether a collection is still present in Qdrant — cheap existence
    check for callers that just need to know if it survived, without paying
    for a full search."""
    try:
        return get_client().collection_exists(name)
    except Exception:
        return False


def delete_collection(name: str) -> None:
    """Remove a collection from Qdrant and local tracking state."""
    client = get_client()
    with _lock:
        _ready_collections.discard(name)
    _unregister_collection(name)
    invalidate_bm25(name)
    try:
        client.delete_collection(name)
        logger.info("Deleted collection '%s' (qdrant)", name)
    except Exception as exc:
        logger.debug("delete_collection failed for '%s': %s", name, exc)


def prune_old_collections(max_age_seconds: int = _COLLECTION_TTL) -> int:
    """Delete collections older than max_age_seconds. Returns count removed."""
    client = get_client()
    cutoff = time.time() - max_age_seconds
    with _lock:
        reg = _load_registry()
        to_delete = [name for name, ts in reg.items() if ts < cutoff]

    removed = 0
    for name in to_delete:
        try:
            client.delete_collection(name)
            invalidate_bm25(name)
            with _lock:
                _ready_collections.discard(name)
            _unregister_collection(name)
            removed += 1
            logger.info("Pruned old collection '%s' (qdrant)", name)
        except Exception:
            pass

    if removed:
        logger.info("Pruned %d old Qdrant collection(s)", removed)
    return removed
