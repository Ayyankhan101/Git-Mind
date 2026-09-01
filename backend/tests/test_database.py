from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.db import Analysis, Base
from services.database import (
    _analysis_row_to_dict,
    get_analysis_db,
    persist_analysis_db,
)


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


class TestAnalysisPersistence:
    async def test_round_trip_includes_audit_fields(self, db_session):
        session_id = "00000000-0000-0000-0000-000000000099"
        snapshot = {
            "repo_name": "test-repo",
            "repo_url": "https://github.com/owner/repo",
            "architecture_diagram": "graph TD",
            "api_docs": [{"route": "/health"}],
            "security_findings": [{"id": "s1"}],
            "cve_findings": [{"package": "requests"}],
            "chroma_collection_name": "col-1",
            "git_audit": {"commits": 3},
            "solidity_audit": {"contracts": [], "findings": [{"id": "sol1"}]},
            "code_audit": [{"language": "python", "findings": [{"id": "py1"}]}],
            "health": {"score": 82, "grade": "B"},
            "head_sha": "abc123",
            "chat_history": [],
            "owner_hash": None,
            "saved_at": 1.0,
        }

        async with db_session() as session:
            session.add(Analysis(id=session_id, **snapshot))
            await session.commit()

        with patch("services.database.async_session_factory", db_session):
            restored = await get_analysis_db(session_id)

        assert restored is not None
        assert restored["health"] == snapshot["health"]
        assert restored["head_sha"] == "abc123"
        assert restored["solidity_audit"] == snapshot["solidity_audit"]
        assert restored["code_audit"] == snapshot["code_audit"]

    async def test_persist_analysis_db_updates_audit_fields(self, db_session):
        session_id = "00000000-0000-0000-0000-000000000098"
        initial = {
            "repo_name": "repo",
            "repo_url": "https://github.com/owner/repo",
            "architecture_diagram": None,
            "api_docs": [],
            "security_findings": [],
            "cve_findings": [],
            "chroma_collection_name": None,
            "git_audit": None,
            "solidity_audit": None,
            "code_audit": None,
            "health": None,
            "head_sha": None,
            "chat_history": [],
            "owner_hash": None,
            "saved_at": 1.0,
        }

        with patch("services.database.async_session_factory", db_session):
            await persist_analysis_db(session_id, initial)
            await persist_analysis_db(
                session_id,
                {
                    **initial,
                    "solidity_audit": {"findings": []},
                    "code_audit": [{"language": "go", "findings": []}],
                    "health": {"score": 90, "grade": "A"},
                },
            )
            restored = await get_analysis_db(session_id)

        assert restored["solidity_audit"] == {"findings": []}
        assert restored["code_audit"] == [{"language": "go", "findings": []}]
        assert restored["health"]["grade"] == "A"

    def test_analysis_row_to_dict_defaults_lists(self):
        row = Analysis(
            id="00000000-0000-0000-0000-000000000097",
            repo_name="repo",
            repo_url="https://github.com/owner/repo",
        )
        data = _analysis_row_to_dict(row)
        assert data["security_findings"] == []
        assert data["cve_findings"] == []
        assert data["chat_history"] == []
        assert data["solidity_audit"] is None
        assert data["code_audit"] is None
