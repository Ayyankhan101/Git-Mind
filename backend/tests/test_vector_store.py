"""vector_store picks its backend once, at import time, from QDRANT_URL.

These tests reload the module under each env condition rather than importing
it once, since the dispatch decision (chroma vs qdrant) is baked in at
import time by design — see vector_store.py's module docstring.
"""

import importlib


def test_defaults_to_chroma_when_qdrant_url_unset(monkeypatch):
    monkeypatch.delenv("QDRANT_URL", raising=False)
    from vectors import vector_store

    importlib.reload(vector_store)
    assert vector_store.BACKEND == "chroma"
    assert vector_store.embed_codebase.__module__ == "vectors.chroma_utils"


def test_switches_to_qdrant_when_url_set(monkeypatch):
    monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
    from vectors import vector_store

    importlib.reload(vector_store)
    assert vector_store.BACKEND == "qdrant"
    assert vector_store.embed_codebase.__module__ == "vectors.qdrant_utils"

    # Restore the default for any tests that import vector_store after this one.
    monkeypatch.delenv("QDRANT_URL", raising=False)
    importlib.reload(vector_store)


def test_exposes_collection_exists_for_both_backends(monkeypatch):
    """Regression guard: routes/chat.py's defensive existence check must be
    reachable through this facade for whichever backend is active — the
    original bug was a caller bypassing the facade entirely, not this facade
    missing the function, but every dispatched name needs this same coverage
    so a future omission here is caught immediately rather than downstream."""
    from vectors import vector_store

    monkeypatch.delenv("QDRANT_URL", raising=False)
    importlib.reload(vector_store)
    assert vector_store.collection_exists.__module__ == "vectors.chroma_utils"

    monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
    importlib.reload(vector_store)
    assert vector_store.collection_exists.__module__ == "vectors.qdrant_utils"

    monkeypatch.delenv("QDRANT_URL", raising=False)
    importlib.reload(vector_store)
