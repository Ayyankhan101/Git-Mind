import logging
import threading
from pathlib import Path

import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

_CHROMA_PATH = Path(__file__).parent / ".chroma"
_client = chromadb.PersistentClient(path=str(_CHROMA_PATH))
_collections: dict[str, chromadb.Collection] = {}
_lock = threading.Lock()   # guards _collections under concurrent WebSocket sessions


def embed_codebase(file_contents: dict[str, str], collection_name: str) -> str:
    with _lock:
        if collection_name in _collections:
            logger.debug("Collection '%s' already embedded — skipping", collection_name)
            return collection_name

    collection = _client.create_collection(name=collection_name, get_or_create=True)

    # Skip re-embedding if the collection already has documents (e.g. after server restart)
    if collection.count() > 0:
        logger.debug("Collection '%s' has %d docs — skipping re-embed", collection_name, collection.count())
        with _lock:
            _collections[collection_name] = collection
        return collection_name

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=80,
        separators=["\nclass ", "\ndef ", "\n\n", "\n", " "],
    )

    docs: list[str] = []
    metas: list[dict] = []
    ids: list[str] = []

    for fp, content in file_contents.items():
        for i, chunk in enumerate(splitter.split_text(content)):
            docs.append(chunk)
            metas.append({"filepath": fp, "chunk_index": i})
            ids.append(f"{fp}::{i}")

    # ChromaDB add() has a soft limit of ~100 items per batch
    for i in range(0, len(docs), 100):
        collection.add(
            documents=docs[i : i + 100],
            metadatas=metas[i : i + 100],
            ids=ids[i : i + 100],
        )

    with _lock:
        _collections[collection_name] = collection

    logger.info("Embedded %d chunks into collection '%s'", len(docs), collection_name)
    return collection_name


def search_codebase(collection_name: str, query: str, n_results: int = 5) -> list[dict]:
    with _lock:
        collection = _collections.get(collection_name)

    if collection is None:
        collection = _client.get_collection(collection_name)
        with _lock:
            _collections[collection_name] = collection

    result = collection.query(query_texts=[query], n_results=n_results)
    return [
        {"filepath": m["filepath"], "content": d}
        for d, m in zip(result["documents"][0], result["metadatas"][0])
    ]
