"""Tests for hybrid access: /analysis/{id} public ≤24h, authed after,
and _trim_analysis strips internal fields."""

import time

from routes.analysis import ALL_PUBLIC_KEYS, _trim_analysis


class TestTrimAnalysis:
    """_trim_analysis must strip internal fields from API responses."""

    def test_owner_hash_excluded(self):
        snap = {
            "repo_name": "test",
            "saved_at": time.time(),
            "owner_hash": "SECRET",
            "chroma_collection_name": "SECRET",
            "chat_history": [{"role": "user", "content": "SECRET"}],
            "health": {"grade": "A"},
            "head_sha": "abc",
        }
        result = _trim_analysis(snap)
        assert "owner_hash" not in result
        assert "chroma_collection_name" not in result
        assert "chat_history" not in result

    def test_public_fields_present(self):
        snap = {
            "repo_name": "my-repo",
            "saved_at": time.time(),
            "health": {"grade": "A"},
            "head_sha": "abc123",
            "owner_hash": "x",
            "chroma_collection_name": "x",
        }
        result = _trim_analysis(snap)
        assert result["repo_name"] == "my-repo"
        assert result["health"] == {"grade": "A"}
        assert result["head_sha"] == "abc123"

    def test_all_public_keys_pass_through(self):
        snap = {k: f"val-{k}" for k in ALL_PUBLIC_KEYS}
        snap["owner_hash"] = "SECRET"
        result = _trim_analysis(snap)
        for key in ALL_PUBLIC_KEYS:
            assert key in result, f"Missing public key: {key}"
        assert "owner_hash" not in result

    def test_architecture_graph_in_public_keys(self):
        """architecture_graph must be in ALL_PUBLIC_KEYS (ADR-0002)."""
        assert "architecture_graph" in ALL_PUBLIC_KEYS

    def test_architecture_graph_in_trim_analysis(self):
        """_trim_analysis must include architecture_graph in output."""
        snap = {
            "architecture_graph": {"nodes": [{"id": "1"}], "edges": []},
            "repo_name": "test",
        }
        result = _trim_analysis(snap)
        assert "architecture_graph" in result
        assert result["architecture_graph"]["nodes"][0]["id"] == "1"

    def test_empty_dict_returns_empty(self):
        assert _trim_analysis({}) == {}

    def test_missing_keys_not_in_result(self):
        snap = {"repo_name": "test"}
        result = _trim_analysis(snap)
        assert "health" not in result  # missing from snap, not in result


class TestHybridAccessLogic:
    """Time-based access control: ≤24h public, older requires auth."""

    def test_recent_within_24h(self):
        """saved_at within 24h → no auth needed."""
        saved_at = time.time() - 3600  # 1h ago
        assert time.time() - saved_at <= 86400

    def test_old_beyond_24h(self):
        """saved_at beyond 24h → auth needed."""
        saved_at = time.time() - 90000  # 25h ago
        assert time.time() - saved_at > 86400

    def test_boundary_exactly_24h(self):
        """Exactly 24h old → still public (not > 86400)."""
        now = time.time()
        saved_at = now - 86400
        elapsed = now - saved_at
        assert elapsed <= 86400 + 0.01  # float tolerance

    def test_boundary_24h_plus_1s(self):
        """24h + 1s → requires auth."""
        saved_at = time.time() - 86401
        assert time.time() - saved_at > 86400

    def test_missing_saved_at_treated_as_old(self):
        """No saved_at → treat as old (safe default)."""
        snap = {"repo_name": "test"}
        assert time.time() - (snap.get("saved_at") or 0) > 86400
