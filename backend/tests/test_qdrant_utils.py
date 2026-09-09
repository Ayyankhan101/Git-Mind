"""Tests for the Qdrant-backed vector store (Phase 0, blocker 2).

Runs against an in-memory QdrantClient (``location=":memory:"``) so these
don't need a real Qdrant server — same idea as chroma_utils using a temp
on-disk PersistentClient. fastembed downloads its ONNX model on first use
(cached afterwards); these tests exercise the real embedder rather than
mocking it out, since embedding correctness (384 dims, deterministic-enough
ranking) is exactly what would silently break in a hand-rolled fake.
"""

import pytest
from qdrant_client import QdrantClient

from vectors import qdrant_utils


class FakeSyncRedis:
    """Minimal sync Redis stand-in (hash ops only) with real storage — the
    registry is a Redis hash keyed by collection name, see qdrant_utils.py's
    Registry helpers section."""

    def __init__(self):
        self.hashes: dict[str, dict[str, str]] = {}

    def ping(self):
        return True

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    def hset(self, key, field=None, value=None, mapping=None):
        bucket = self.hashes.setdefault(key, {})
        if mapping:
            bucket.update({k: str(v) for k, v in mapping.items()})
        if field is not None:
            bucket[field] = str(value)

    def hdel(self, key, *fields):
        bucket = self.hashes.get(key, {})
        for f in fields:
            bucket.pop(f, None)

    def delete(self, key):
        self.hashes.pop(key, None)


@pytest.fixture(autouse=True)
def isolated_qdrant(monkeypatch):
    """Fresh in-memory Qdrant client + clean module state per test."""
    client = QdrantClient(location=":memory:")
    monkeypatch.setattr(qdrant_utils, "_client", client)
    monkeypatch.setattr(qdrant_utils, "_registry_redis", FakeSyncRedis())
    monkeypatch.setattr(qdrant_utils, "_registry_redis_checked", True)
    qdrant_utils._ready_collections.clear()
    qdrant_utils._embed_events.clear()
    yield client


FILES = {
    "src/auth.py": (
        "def login(user, password):\n    check_credentials(user, password)\n    return issue_token(user)\n"
    ),
    "src/payments.py": (
        "def charge_card(amount, card):\n    validate_card(card)\n    return gateway.charge(amount, card)\n"
    ),
}


class TestEmbedCodebase:
    def test_creates_collection_and_returns_name(self):
        name = qdrant_utils.embed_codebase(FILES, "col_embed_basic")
        assert name == "col_embed_basic"
        assert qdrant_utils.get_client().collection_exists("col_embed_basic")

    def test_populates_points(self):
        qdrant_utils.embed_codebase(FILES, "col_embed_points")
        count = qdrant_utils.get_client().count("col_embed_points", exact=True).count
        assert count > 0

    def test_skips_reembed_when_already_populated(self):
        qdrant_utils.embed_codebase(FILES, "col_embed_once")
        first_count = qdrant_utils.get_client().count("col_embed_once", exact=True).count
        qdrant_utils.embed_codebase(FILES, "col_embed_once")
        second_count = qdrant_utils.get_client().count("col_embed_once", exact=True).count
        assert first_count == second_count


class TestSearchCodebase:
    def test_finds_relevant_file(self):
        qdrant_utils.embed_codebase(FILES, "col_search_auth")
        results = qdrant_utils.search_codebase("col_search_auth", "how does login work", n_results=3)
        assert results
        assert any("auth.py" in r["filepath"] for r in results)

    def test_strips_context_header_from_content(self):
        qdrant_utils.embed_codebase(FILES, "col_search_header")
        results = qdrant_utils.search_codebase("col_search_header", "charge a card", n_results=3)
        assert results
        assert not any(r["content"].startswith("[File:") for r in results)

    def test_missing_collection_returns_empty(self):
        assert qdrant_utils.search_codebase("does_not_exist", "anything") == []

    def test_language_filter_narrows_results(self):
        qdrant_utils.embed_codebase(FILES, "col_search_filter")
        results = qdrant_utils.search_codebase(
            "col_search_filter", "credentials", n_results=5, language_filter="Python"
        )
        assert all(r["language"] == "Python" for r in results)


class TestDeleteCollection:
    def test_removes_collection(self):
        qdrant_utils.embed_codebase(FILES, "col_delete_me")
        qdrant_utils.delete_collection("col_delete_me")
        assert not qdrant_utils.get_client().collection_exists("col_delete_me")

    def test_missing_collection_is_a_noop(self):
        qdrant_utils.delete_collection("never_existed")  # should not raise


class TestCollectionExists:
    def test_true_for_embedded_collection(self):
        qdrant_utils.embed_codebase(FILES, "col_exists_check")
        assert qdrant_utils.collection_exists("col_exists_check") is True

    def test_false_for_missing_collection(self):
        assert qdrant_utils.collection_exists("never_embedded") is False


class TestRegistryRedisUnavailable:
    """No REDIS_URL / unreachable Redis must degrade to a no-op registry —
    embed/search/delete all still work, pruning just can't track anything."""

    def test_operations_are_noop_without_redis(self, monkeypatch):
        monkeypatch.setattr(qdrant_utils, "_registry_redis", None)
        monkeypatch.setattr(qdrant_utils, "_registry_redis_checked", True)

        qdrant_utils._register_collection("col_no_redis")  # must not raise
        assert qdrant_utils._load_registry() == {}
        qdrant_utils._unregister_collection("col_no_redis")  # must not raise

    def test_embed_codebase_succeeds_without_redis(self, monkeypatch):
        monkeypatch.setattr(qdrant_utils, "_registry_redis", None)
        monkeypatch.setattr(qdrant_utils, "_registry_redis_checked", True)

        name = qdrant_utils.embed_codebase(FILES, "col_embed_no_redis")
        assert qdrant_utils.get_client().collection_exists(name)


class TestDeleteCollectionUnregisters:
    def test_removes_registry_entry(self):
        qdrant_utils.embed_codebase(FILES, "col_delete_registry")
        assert "col_delete_registry" in qdrant_utils._load_registry()

        qdrant_utils.delete_collection("col_delete_registry")
        assert "col_delete_registry" not in qdrant_utils._load_registry()


class TestPruneOldCollections:
    def test_prunes_expired_entry(self):
        qdrant_utils.embed_codebase(FILES, "col_prune_old")
        reg = qdrant_utils._load_registry()
        reg["col_prune_old"] = 0.0  # far in the past
        qdrant_utils._save_registry(reg)

        removed = qdrant_utils.prune_old_collections(max_age_seconds=1)
        assert removed == 1
        assert not qdrant_utils.get_client().collection_exists("col_prune_old")

    def test_keeps_fresh_entry(self):
        qdrant_utils.embed_codebase(FILES, "col_prune_fresh")
        removed = qdrant_utils.prune_old_collections(max_age_seconds=_far_future())
        assert removed == 0
        assert qdrant_utils.get_client().collection_exists("col_prune_fresh")


def _far_future() -> int:
    return 60 * 60 * 24 * 365 * 10
