import logging
import tempfile
import threading
import time
from pathlib import Path

import chromadb
import orjson

logger = logging.getLogger(__name__)

_COLLECTION_TTL = 60 * 60 * 24 * 7  # 7 days


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

                docs, metas_json, ids = split_files(
                    file_contents,
                    800,  # chunk_size
                    80,  # chunk_overlap
                    ["\nclass ", "\ndef ", "\n\n", "\n", " "],
                )
                metas = [orjson.loads(m) for m in metas_json]
            except ImportError:
                # Fallback to Python splitter if Rust module unavailable
                from langchain_text_splitters import RecursiveCharacterTextSplitter

                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=800,
                    chunk_overlap=80,
                    separators=["\nclass ", "\ndef ", "\n\n", "\n", " "],
                )
                docs, metas, ids = [], [], []
                for fp, content in file_contents.items():
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


def search_codebase(collection_name: str, query: str, n_results: int = 5) -> list[dict]:
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
    result = collection.query(query_texts=[query], n_results=n)
    return [
        {"filepath": m["filepath"], "content": d}
        for d, m in zip(result["documents"][0], result["metadatas"][0], strict=False)
    ]


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
