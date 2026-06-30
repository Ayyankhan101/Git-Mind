from unittest.mock import AsyncMock, patch

import pytest

from services.session import (
    _session_to_snapshot,
    _session_timestamps,
    _sessions,
    get_session,
    initial_state,
    persist_analysis,
    put_session,
)


@pytest.fixture(autouse=True)
def clear_sessions():
    _sessions.clear()
    _session_timestamps.clear()


VALID_UUID = "00000000-0000-0000-0000-000000000001"


class TestInitialState:
    def test_returns_correct_shape(self):
        state = initial_state("https://github.com/owner/repo")
        assert state["repo_url"] == "https://github.com/owner/repo"
        assert state["gh_token"] is None
        assert state["security_findings"] == []
        assert state["cve_findings"] == []
        assert state["solidity_audit"] is None
        assert state["code_audit"] is None
        assert state["head_sha"] is None
        assert state["chat_history"] == []
        assert state["crisis_turn"] == 0

    def test_accepts_token(self):
        state = initial_state("https://github.com/owner/repo", "ghp_token123")
        assert state["gh_token"] == "ghp_token123"


class TestPutSession:
    def test_stores_and_retrieves(self):
        put_session(VALID_UUID, {"key": "value"})
        session = _sessions.get(VALID_UUID)
        assert session == {"key": "value"}

    def test_moves_to_end_on_access(self):
        put_session("session_a", {"a": 1})
        put_session("session_b", {"b": 2})
        session = _sessions.get("session_a")
        assert session == {"a": 1}


class TestGetSession:
    async def test_returns_from_memory(self):
        put_session(VALID_UUID, {"from": "memory"})
        result = await get_session(VALID_UUID)
        assert result == {"from": "memory"}

    async def test_returns_none_when_not_found(self):
        with patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=None):
            result = await get_session("00000000-0000-0000-0000-000000009999")
            assert result is None

    async def test_restores_from_database(self):
        db_snap = {
            "repo_name": "test-repo",
            "chroma_collection_name": "col123",
            "security_findings": [{"id": "f1"}],
            "cve_findings": [{"id": "cve1"}],
            "api_docs": ["doc1"],
            "architecture_diagram": "digraph {}",
            "git_audit": {"commits": 5},
            "repo_url": "https://github.com/owner/repo",
            "chat_history": [],
        }
        with patch("services.database.get_analysis_db", new_callable=AsyncMock, return_value=db_snap):
            result = await get_session(VALID_UUID)
            assert result["repo_name"] == "test-repo"
            assert result["chroma_collection_name"] == "col123"
            assert result["chat_history"] == []


class TestPersistAnalysis:
    async def test_skips_non_uuid(self):
        with patch("services.session.logger") as mock_log:
            await persist_analysis("not-uuid", {}, "url", "sha")
            mock_log.warning.assert_called_once()

    async def test_persists_valid_session(self):
        final = {
            "repo_name": "repo",
            "architecture_diagram": None,
            "api_docs": [],
            "security_findings": [],
            "cve_findings": [],
            "chroma_collection_name": "col",
            "git_audit": None,
            "solidity_audit": {"findings": []},
            "code_audit": [{"language": "python", "findings": []}],
            "health": {"score": 70, "grade": "C"},
        }
        with (
            patch("services.database.upsert_sha_index", new_callable=AsyncMock) as mock_update,
            patch("services.database.persist_analysis_db", new_callable=AsyncMock) as mock_persist,
        ):
            await persist_analysis(VALID_UUID, final, "url", "sha")
            mock_persist.assert_awaited_once()
            args = mock_persist.await_args[0]
            assert args[0] == VALID_UUID
            assert args[1]["repo_name"] == "repo"
            assert args[1]["head_sha"] == "sha"
            assert args[1]["solidity_audit"] == {"findings": []}
            assert args[1]["code_audit"] == [{"language": "python", "findings": []}]
            assert args[1]["health"]["grade"] == "C"
            mock_update.assert_awaited_once_with("sha", VALID_UUID)


class TestSessionToSnapshot:
    def test_includes_audit_fields(self):
        final = {
            "repo_name": "repo",
            "architecture_diagram": None,
            "api_docs": [],
            "security_findings": [],
            "cve_findings": [],
            "chroma_collection_name": None,
            "git_audit": None,
            "solidity_audit": {"contracts": []},
            "code_audit": [{"language": "rust", "findings": []}],
            "health": {"score": 88, "grade": "B"},
            "chat_history": [],
        }
        snap = _session_to_snapshot(VALID_UUID, final, "https://github.com/owner/repo", "sha1")
        assert snap["solidity_audit"] == {"contracts": []}
        assert snap["code_audit"] == [{"language": "rust", "findings": []}]
        assert snap["health"]["score"] == 88
        assert snap["head_sha"] == "sha1"
