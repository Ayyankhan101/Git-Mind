"""vector_store picks its backend once, at import time, from QDRANT_URL.

These tests reload the module under each env condition rather than importing
it once, since the dispatch decision (chroma vs qdrant) is baked in at
import time by design — see vector_store.py's module docstring.
"""

import importlib


def test_defaults_to_chroma_when_qdrant_url_unset(monkeypatch):
    monkeypatch.delenv("QDRANT_URL", raising=False)
    import vector_store

    importlib.reload(vector_store)
    assert vector_store.BACKEND == "chroma"
    assert vector_store.embed_codebase.__module__ == "chroma_utils"


def test_switches_to_qdrant_when_url_set(monkeypatch):
    monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
    import vector_store

    importlib.reload(vector_store)
    assert vector_store.BACKEND == "qdrant"
    assert vector_store.embed_codebase.__module__ == "qdrant_utils"

    # Restore the default for any tests that import vector_store after this one.
    monkeypatch.delenv("QDRANT_URL", raising=False)
    importlib.reload(vector_store)
