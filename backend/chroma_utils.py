import logging
import tempfile
import threading
import time
from pathlib import Path

import chromadb
import orjson

logger = logging.getLogger(__name__)

_COLLECTION_TTL = 60 * 60 * 24 * 7  # 7 days


# ── Language-aware chunking separators ─────────────────────────────────────
# Keyed by file extension; falls back to the default Python-oriented list.
_LANG_SEPARATORS: dict[str, list[str]] = {
    ".py": ["\nclass ", "\ndef ", "\n    def ", "\n\n", "\n", " "],
    ".js": ["\nexport ", "\nconst ", "\nfunction ", "\nclass ", "\n\n", "\n", " "],
    ".ts": ["\nexport ", "\nconst ", "\nfunction ", "\nclass ", "\ninterface ", "\n\n", "\n", " "],
    ".jsx": ["\nexport ", "\nconst ", "\nfunction ", "\nclass ", "\n\n", "\n", " "],
    ".tsx": ["\nexport ", "\nconst ", "\nfunction ", "\nclass ", "\ninterface ", "\n\n", "\n", " "],
    ".go": ["\nfunc ", "\ntype ", "\npackage ", "\n\n", "\n", " "],
    ".rs": ["\nfn ", "\npub fn ", "\nimpl ", "\nstruct ", "\nenum ", "\n\n", "\n", " "],
    ".java": ["\npublic class ", "\nclass ", "\npublic void ", "\nprivate void ", "\n\n", "\n", " "],
    ".rb": ["\ndef ", "\nclass ", "\nmodule ", "\n\n", "\n", " "],
    ".php": ["\nfunction ", "\nclass ", "\npublic function ", "\nprivate function ", "\n\n", "\n", " "],
}

_DEFAULT_SEPARATORS = ["\nclass ", "\ndef ", "\n\n", "\n", " "]


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


_PREFERRED_CHROMA = Path(__file__).parent / ".chroma"
_PREFERRED_REGISTRY = Path(__file__).parent / ".chroma_registry.json"

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


def _separators_for(filepath: str) -> list[str]:
    """Return language-appropriate chunking separators for a file."""
    ext = Path(filepath).suffix.lower()
    return _LANG_SEPARATORS.get(ext, _DEFAULT_SEPARATORS)


# ── Registry helpers (track collection creation times for TTL pruning) ─────────


def _load_registry() -> dict[str, float]:
    try:
        return orjson.loads(_REGISTRY_PATH.read_bytes())
    except Exception:
        return {}


def _save_registry(reg: dict[str, float]) -> None:
    try:
        _REGISTRY_PATH.write_bytes(orjson.dumps(reg))
    except Exception as exc:
        logger.debug("registry write failed: %s", exc)


def _register_collection(name: str) -> None:
    with _lock:
        reg = _load_registry()
        reg[name] = time.time()
        _save_registry(reg)


# ── Public API ─────────────────────────────────────────────────────────────────


def embed_codebase(file_contents: dict[str, str], collection_name: str) -> str:
    """
    Embed file_contents into a ChromaDB collection.

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
            try:
                from gitmind_core import split_files

                # Use per-file separators: group files by extension, split
                # each group with its own separator set, then merge.
                ext_groups: dict[str, dict[str, str]] = {}
                for fp, content in file_contents.items():
                    ext = Path(fp).suffix.lower()
                    ext_groups.setdefault(ext, {})[fp] = content

                all_docs: list[str] = []
                all_metas: list[dict] = []
                all_ids: list[str] = []

                for ext, group in ext_groups.items():
                    seps = _LANG_SEPARATORS.get(ext, _DEFAULT_SEPARATORS)
                    docs, metas_json, ids = split_files(group, 800, 80, seps)
                    all_docs.extend(docs)
                    all_metas.extend(orjson.loads(m) for m in metas_json)
                    all_ids.extend(ids)

                docs, metas, ids = all_docs, all_metas, all_ids
            except ImportError:
                # Fallback to Python splitter if Rust module unavailable
                from langchain_text_splitters import RecursiveCharacterTextSplitter

                docs, metas, ids = [], [], []
                for fp, content in file_contents.items():
                    seps = _LANG_SEPARATORS.get(Path(fp).suffix.lower(), _DEFAULT_SEPARATORS)
                    splitter = RecursiveCharacterTextSplitter(
                        chunk_size=800,
                        chunk_overlap=80,
                        separators=seps,
                    )
                    for i, chunk in enumerate(splitter.split_text(content)):
                        docs.append(chunk)
                        metas.append({"filepath": fp, "chunk_index": i})
                        ids.append(f"{fp}::{i}")

            for i in range(0, len(docs), 100):
                collection.add(
                    documents=docs[i : i + 100],
                    metadatas=metas[i : i + 100],
                    ids=ids[i : i + 100],
                )

            logger.info("Embedded %d chunks into '%s'", len(docs), collection_name)

        with _lock:
            _collections[collection_name] = collection
        _register_collection(collection_name)

        # Invalidate any stale BM25 index from a previous embed
        try:
            from services.bm25_index import invalidate as _invalidate_bm25

            _invalidate_bm25(collection_name)
        except Exception:
            pass

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
    *,
    use_hybrid: bool = True,
    use_reranker: bool = True,
    bm25_weight: float = 0.3,
) -> list[dict]:
    """Search a ChromaDB collection with optional hybrid search and reranking.

    Parameters
    ----------
    use_hybrid : bool
        When True (default), BM25 keyword search is combined with vector
        search using Reciprocal Rank Fusion (RRF).
    use_reranker : bool
        When True (default), a cross-encoder reranker is applied on top of
        the fused results to re-score and select the best chunks.
    bm25_weight : float
        Weight for BM25 scores in the RRF fusion (0–1). Lower values
        favour vector similarity; higher values favour keyword matching.
    """
    with _lock:
        collection = _collections.get(collection_name)
        # If embedding is in progress, grab the event to wait on
        event = _embed_events.get(collection_name) if collection is None else None

    if event is not None:
        logger.debug("search_codebase: waiting for '%s' to finish embedding", collection_name)
        event.wait(timeout=30)
        with _lock:
            collection = _collections.get(collection_name)

    if collection is None:
        # Try loading from ChromaDB persistence (e.g. after server restart)
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

    n = min(n_results, count)

    # ── Vector search ──────────────────────────────────────────────────────
    vec_result = collection.query(query_texts=[query], n_results=n)
    vec_candidates = [
        {
            "filepath": m["filepath"],
            "content": d,
            "vec_score": 1.0 - (i / n),  # approximate rank-based score
        }
        for i, (d, m) in enumerate(zip(vec_result["documents"][0], vec_result["metadatas"][0], strict=False))
    ]

    # ── Hybrid search (RRF fusion) ─────────────────────────────────────────
    if use_hybrid and count >= 10:
        try:
            from services.bm25_index import bm25_search

            bm25_results = bm25_search(collection, query, n_results=n)
            if bm25_results:
                vec_candidates = _rrf_fuse(vec_candidates, bm25_results, bm25_weight=bm25_weight)
        except Exception as exc:
            logger.debug("Hybrid search fallback to vector-only: %s", exc)

    # ── Reranking ──────────────────────────────────────────────────────────
    if use_reranker and len(vec_candidates) > n:
        try:
            from services.reranker import rerank

            vec_candidates = rerank(query, vec_candidates, top_k=n)
        except Exception as exc:
            logger.debug("Reranker fallback: %s", exc)

    # ── Dedup and final selection ──────────────────────────────────────────
    seen: set[str] = set()
    final: list[dict] = []
    for c in vec_candidates[:n_results]:
        fp = c["filepath"]
        if fp in seen:
            continue
        seen.add(fp)
        final.append({"filepath": fp, "content": c["content"]})

    return final


def _rrf_fuse(
    vec_candidates: list[dict],
    bm25_results: list[dict],
    k: int = 60,
    bm25_weight: float = 0.3,
) -> list[dict]:
    """Reciprocal Rank Fusion of vector and BM25 results.

    RRF score = weight / (k + rank).
    A higher *bm25_weight* gives more influence to keyword matches.
    """
    score_map: dict[str, float] = {}
    content_map: dict[str, dict] = {}

    for rank, c in enumerate(vec_candidates):
        key = c["filepath"]
        vec_score = 1.0 / (k + rank + 1)
        score_map[key] = score_map.get(key, 0) + vec_score * (1.0 - bm25_weight)
        content_map[key] = c

    for rank, c in enumerate(bm25_results):
        key = c["filepath"]
        bm25_score = 1.0 / (k + rank + 1)
        score_map[key] = score_map.get(key, 0) + bm25_score * bm25_weight
        if key not in content_map:
            content_map[key] = c

    fused = []
    for fp, score in sorted(score_map.items(), key=lambda x: x[1], reverse=True):
        item = {**content_map[fp], "rrf_score": score}
        fused.append(item)

    return fused


def delete_collection(name: str) -> None:
    """Remove a collection from memory and ChromaDB storage."""
    with _lock:
        _collections.pop(name, None)
        reg = _load_registry()
        reg.pop(name, None)
        _save_registry(reg)
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
