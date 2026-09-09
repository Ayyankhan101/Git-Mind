import json
import tempfile
import threading
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any, TypedDict, cast

import chromadb
import structlog
from langchain_text_splitters import RecursiveCharacterTextSplitter

from services.bm25_index import bm25_search
from services.bm25_index import invalidate as invalidate_bm25
from services.reranker import rerank

logger = structlog.get_logger(__name__)

_COLLECTION_TTL = 60 * 60 * 24 * 7  # 7 days


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


# Anchored on the backend root, not this file's directory — these persist
# directories are addressed as backend/.chroma and backend/.chroma_registry.json
# by .gitignore, the compose volumes, and every operator runbook.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_PREFERRED_CHROMA = _BACKEND_ROOT / ".chroma"
_PREFERRED_REGISTRY = _BACKEND_ROOT / ".chroma_registry.json"

if _writable(_PREFERRED_CHROMA):
    _CHROMA_PATH = _PREFERRED_CHROMA
    _REGISTRY_PATH = _PREFERRED_REGISTRY
else:
    _TMP_BASE = Path(tempfile.gettempdir()) / "gitmind_chroma"
    _TMP_BASE.mkdir(exist_ok=True)
    _CHROMA_PATH = _TMP_BASE
    _REGISTRY_PATH = _TMP_BASE / "registry.json"
    logger.warning("ChromaDB falling back to %s (preferred dir not writable)", _CHROMA_PATH)

_client = chromadb.PersistentClient(path=str(_CHROMA_PATH))

_lock: threading.Lock = threading.Lock()
_collections: dict[str, chromadb.Collection | None] = {}  # None = sentinel (in-progress)
_embed_events: dict[str, threading.Event] = {}  # guards concurrent embeds


# ── Registry helpers (track collection creation times for TTL pruning) ─────────


def _load_registry() -> dict[str, float]:
    try:
        return json.loads(_REGISTRY_PATH.read_text())
    except Exception:
        return {}


def _save_registry(reg: dict[str, float]) -> None:
    try:
        _REGISTRY_PATH.write_text(json.dumps(reg))
    except Exception as exc:
        logger.debug("registry write failed: %s", exc)


def _register_collection(name: str) -> None:
    with _lock:
        reg = _load_registry()
        reg[name] = time.time()
        _save_registry(reg)


# ── Language detection for metadata ────────────────────────────────────────────

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


# ── Enhanced chunking with context ─────────────────────────────────────────────


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
        # Prepend file context to each chunk for better retrieval
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


# ── Public API ─────────────────────────────────────────────────────────────────


def embed_codebase(file_contents: dict[str, str], collection_name: str) -> str:
    """
    Embed file_contents into a ChromaDB collection with enhanced metadata.

    Thread-safe: concurrent calls for the same collection_name block until the
    first caller finishes (instead of racing to embed twice or returning early
    while embedding is still in progress).
    """
    with _lock:
        col = _collections.get(collection_name)
        if col is not None:
            logger.debug("Collection '%s' already ready — skipping", collection_name)
            return collection_name
        if collection_name in _embed_events:
            # Another thread is currently embedding — grab the event to wait on
            event: threading.Event = _embed_events[collection_name]
            should_embed = False
        else:
            # First caller — claim embedding responsibility
            event = threading.Event()
            _embed_events[collection_name] = event
            _collections[collection_name] = None  # sentinel
            should_embed = True

    if not should_embed:
        logger.debug("Collection '%s' embedding in progress — waiting", collection_name)
        event.wait(timeout=120)
        return collection_name

    try:
        collection = _client.create_collection(name=collection_name, get_or_create=True)

        if collection.count() > 0:
            logger.debug(
                "Collection '%s' has %d docs — skipping re-embed",
                collection_name,
                collection.count(),
            )
        else:
            # Enhanced splitter: better separators for code
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=600,  # Smaller chunks for better precision
                chunk_overlap=100,  # More overlap for context continuity
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
                enriched_chunks = _chunk_file_with_context(fp, content, splitter)
                for chunk_text, meta in enriched_chunks:
                    all_chunks.append(chunk_text)
                    all_metas.append(meta)
                    all_ids.append(f"{fp}::{meta['chunk_index']}")

            # Batch insert with metadata
            for i in range(0, len(all_chunks), 100):
                batch_docs = all_chunks[i : i + 100]
                batch_metas = all_metas[i : i + 100]
                batch_ids = all_ids[i : i + 100]

                collection.add(
                    documents=batch_docs,
                    metadatas=batch_metas,  # type: ignore[arg-type]
                    ids=batch_ids,
                )

            logger.info(
                "Embedded %d chunks from %d files into '%s'",
                len(all_chunks),
                len(file_contents),
                collection_name,
            )

        with _lock:
            _collections[collection_name] = collection
        _register_collection(collection_name)

    except Exception:
        with _lock:
            _collections.pop(collection_name, None)
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
    """Search with optional metadata filtering and enhanced scoring."""
    with _lock:
        collection = _collections.get(collection_name)
        event = _embed_events.get(collection_name) if collection is None else None

    if event is not None:
        logger.debug("search_codebase: waiting for '%s' to finish embedding", collection_name)
        event.wait(timeout=30)
        with _lock:
            collection = _collections.get(collection_name)

    if collection is None:
        try:
            collection = _client.get_collection(collection_name)
            with _lock:
                _collections[collection_name] = collection
        except Exception:
            logger.warning("Collection '%s' not found in ChromaDB", collection_name)
            return []

    count = collection.count()
    if count == 0:
        return []

    # Build where filter for metadata
    where_conditions = []
    if layer_filter:
        where_conditions.append({"layer": layer_filter})
    if language_filter:
        where_conditions.append({"language": language_filter})

    where: dict[str, Any] | None = None
    if len(where_conditions) == 1:
        where = where_conditions[0]
    elif len(where_conditions) > 1:
        where = {"$and": where_conditions}

    # Retrieve more candidates for hybrid reranking
    n = min(max(n_results * 2, 10), count)
    result = collection.query(
        query_texts=[query],
        n_results=n,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    distances = result.get("distances") or []

    if not documents or not metadatas:
        return []

    vector_candidates: list[dict[str, Any]] = []
    for rank, (doc, meta, dist) in enumerate(
        zip(documents[0], metadatas[0], distances[0], strict=False),
        start=1,
    ):
        filepath = str(meta.get("filepath", ""))
        chunk_size_raw = meta.get("chunk_size", 0)
        chunk_size = chunk_size_raw if isinstance(chunk_size_raw, (int, float)) else 0
        numeric_dist = dist if isinstance(dist, (int, float)) else 1.0
        vector_score = 1.0 / (1.0 + numeric_dist) * (1.0 + min(chunk_size / 1000, 0.5))
        vector_candidates.append(
            {
                "filepath": filepath,
                "content": _strip_context_header(doc, filepath, meta),
                "language": str(meta.get("language", "")),
                "layer": str(meta.get("layer", "")),
                "score": vector_score,
                "vector_rank": rank,
            }
        )

    bm25_candidates: list[dict[str, Any]] = []
    try:
        raw_bm25 = bm25_search(collection, query, n_results=n)
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

    # Optional cross-encoder rerank on top hybrid candidates
    reranked = rerank(query, ranked_candidates, top_k=max(n_results * 2, 8))

    # Final dedupe: keep best chunk per file
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

    # Sort by score descending
    results.sort(key=lambda x: cast(float, x["score"]), reverse=True)
    return results[:n_results]


def collection_exists(name: str) -> bool:
    """Whether a collection is still present in the store — cheap existence
    check for callers that just need to know if it survived (e.g. after a
    server restart), without paying for a full search."""
    try:
        _client.get_collection(name)
        return True
    except Exception:
        return False


def delete_collection(name: str) -> None:
    """Remove a collection from memory and ChromaDB storage."""
    with _lock:
        _collections.pop(name, None)
        reg = _load_registry()
        reg.pop(name, None)
        _save_registry(reg)
    invalidate_bm25(name)
    try:
        _client.delete_collection(name)
        logger.info("Deleted collection '%s'", name)
    except Exception as exc:
        logger.debug("delete_collection failed for '%s': %s", name, exc)


def prune_old_collections(max_age_seconds: int = _COLLECTION_TTL) -> int:
    """Delete collections older than max_age_seconds. Returns count removed."""
    cutoff = time.time() - max_age_seconds
    with _lock:
        reg = _load_registry()
        to_delete = [name for name, ts in reg.items() if ts < cutoff]

    removed = 0
    for name in to_delete:
        try:
            _client.delete_collection(name)
            invalidate_bm25(name)
            with _lock:
                _collections.pop(name, None)
                reg = _load_registry()
                reg.pop(name, None)
                _save_registry(reg)
            removed += 1
            logger.info("Pruned old collection '%s'", name)
        except Exception:
            pass

    if removed:
        logger.info("Pruned %d old ChromaDB collection(s)", removed)
    return removed
