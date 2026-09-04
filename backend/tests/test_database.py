import importlib
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import services.database as db_module
from models.db import Analysis, Base, ShaIndex
from services.database import (
    _analysis_row_to_dict,
    delete_expired_analyses,
    delete_sha_entries_for_sessions,
    get_analysis_db,
    get_analysis_history_db,
    get_previous_analysis_db,
    get_sha_index_entry,
    persist_analysis_db,
    upsert_sha_index,
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


REPO_URL = "https://github.com/o/r"


class TestReadReplicaBootstrap:
    """Module-level construction (services/database.py top level): the
    DATABASE_READ_REPLICA_URL env var decides whether read_engine is a real
    second engine or just an alias for the primary, and whether the same
    postgres pool tuning as the primary applies to it."""

    @pytest.fixture
    def reloaded(self, monkeypatch):
        """Reload services.database under a caller-set env, then reload it
        again with a clean env afterward — so no test leaves the shared
        module in a state a later test could silently depend on."""

        def _reload_with(replica_url: str | None):
            if replica_url is None:
                monkeypatch.delenv("DATABASE_READ_REPLICA_URL", raising=False)
            else:
                monkeypatch.setenv("DATABASE_READ_REPLICA_URL", replica_url)
            importlib.reload(db_module)
            return db_module

        yield _reload_with
        monkeypatch.delenv("DATABASE_READ_REPLICA_URL", raising=False)
        importlib.reload(db_module)

    def test_no_env_var_read_engine_aliases_primary(self, reloaded):
        mod = reloaded(None)
        assert mod.read_engine is mod.engine
        assert mod._read_session_maker is None

    def test_env_var_creates_a_distinct_engine(self, reloaded):
        mod = reloaded("postgresql+asyncpg://user:pass@replica-host:5432/gitmind")
        assert mod.read_engine is not mod.engine
        assert mod._read_session_maker is not None

    def test_postgres_replica_url_gets_the_same_pool_tuning_as_primary(self, reloaded):
        mod = reloaded("postgresql+asyncpg://user:pass@replica-host:5432/gitmind")
        assert mod.read_engine.pool._recycle == 300
        assert mod.read_engine.pool._pre_ping is True

    def test_non_postgres_replica_url_gets_no_pool_tuning(self, reloaded):
        mod = reloaded("sqlite+aiosqlite:///:memory:")
        assert mod.read_engine.pool._recycle == -1  # SQLAlchemy default, i.e. untouched
        assert mod.read_engine.pool._pre_ping is False


class TestReadReplicaRouting:
    """Phase 3 (docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md): every read-only
    query function routes to a configured replica; every write always stays
    on the primary, even when a replica is configured."""

    @pytest.fixture
    async def two_databases(self):
        """Two distinct in-memory SQLite DBs, each seeded with a row that's
        identifiably 'from-primary' or 'from-replica' — every test below
        proves which DB actually answered by checking which label came back."""
        primary_engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        replica_engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with primary_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with replica_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        primary_factory = async_sessionmaker(primary_engine, expire_on_commit=False)
        replica_factory = async_sessionmaker(replica_engine, expire_on_commit=False)

        session_id = "00000000-0000-0000-0000-000000000096"
        seeds = {
            "from-primary": (primary_factory, 100.0),
            "from-replica": (replica_factory, 200.0),
        }
        for label, (factory, saved_at) in seeds.items():
            async with factory() as session:
                session.add(
                    Analysis(
                        id=session_id,
                        repo_name=label,
                        repo_url=REPO_URL,
                        saved_at=saved_at,
                        health={"score": 1},
                        head_sha=f"{label}-sha",
                    )
                )
                session.add(ShaIndex(sha="sha-x", session_id=f"{label}-sha-session"))
                await session.commit()

        yield session_id, primary_factory, replica_factory
        await primary_engine.dispose()
        await replica_engine.dispose()

    @pytest.fixture
    def with_replica(self, two_databases):
        """Patch the module so async_session_factory=primary, replica configured."""
        _session_id, primary_factory, replica_factory = two_databases
        with (
            patch("services.database.async_session_factory", primary_factory),
            patch("services.database._read_session_maker", replica_factory),
        ):
            yield two_databases

    @pytest.fixture
    def without_replica(self, two_databases):
        """Patch the module so async_session_factory=primary, no replica configured."""
        _session_id, primary_factory, _replica_factory = two_databases
        with (
            patch("services.database.async_session_factory", primary_factory),
            patch("services.database._read_session_maker", None),
        ):
            yield two_databases

    # ── Reads: replica wins when configured ─────────────────────────────

    async def test_get_analysis_db_uses_replica(self, with_replica):
        session_id, _p, _r = with_replica
        restored = await get_analysis_db(session_id)
        assert restored["repo_name"] == "from-replica"

    async def test_get_sha_index_entry_uses_replica(self, with_replica):
        result = await get_sha_index_entry("sha-x")
        assert result == "from-replica-sha-session"

    async def test_get_previous_analysis_db_uses_replica(self, with_replica):
        result = await get_previous_analysis_db(REPO_URL)
        assert result["repo_name"] == "from-replica"

    async def test_get_analysis_history_db_uses_replica(self, with_replica):
        result = await get_analysis_history_db(REPO_URL)
        assert len(result) == 1
        assert result[0]["head_sha"] == "from-replica-sha"

    # ── Reads: fall back to primary when no replica configured ─────────

    async def test_get_analysis_db_falls_back_to_primary(self, without_replica):
        session_id, _p, _r = without_replica
        restored = await get_analysis_db(session_id)
        assert restored["repo_name"] == "from-primary"

    async def test_get_sha_index_entry_falls_back_to_primary(self, without_replica):
        result = await get_sha_index_entry("sha-x")
        assert result == "from-primary-sha-session"

    async def test_get_previous_analysis_db_falls_back_to_primary(self, without_replica):
        result = await get_previous_analysis_db(REPO_URL)
        assert result["repo_name"] == "from-primary"

    async def test_get_analysis_history_db_falls_back_to_primary(self, without_replica):
        result = await get_analysis_history_db(REPO_URL)
        assert len(result) == 1
        assert result[0]["head_sha"] == "from-primary-sha"

    # ── Writes: always the primary, replica never touched ───────────────

    async def test_persist_analysis_db_never_touches_replica(self, with_replica):
        session_id, primary_factory, replica_factory = with_replica
        await persist_analysis_db(session_id, {"repo_name": "written-by-test", "repo_url": REPO_URL})

        async with primary_factory() as session:
            row = await session.get(Analysis, session_id)
            assert row.repo_name == "written-by-test"
        async with replica_factory() as session:
            row = await session.get(Analysis, session_id)
            assert row.repo_name == "from-replica", "the replica must be untouched by a write"

    async def test_upsert_sha_index_never_touches_replica(self, with_replica):
        _session_id, primary_factory, replica_factory = with_replica
        await upsert_sha_index("sha-x", "written-by-test-session")

        async with primary_factory() as session:
            row = await session.get(ShaIndex, "sha-x")
            assert row.session_id == "written-by-test-session"
        async with replica_factory() as session:
            row = await session.get(ShaIndex, "sha-x")
            assert row.session_id == "from-replica-sha-session", "the replica must be untouched by a write"

    async def test_delete_expired_analyses_never_touches_replica(self, with_replica):
        session_id, primary_factory, replica_factory = with_replica
        removed = await delete_expired_analyses(cutoff=150.0)  # only primary's saved_at=100.0 is older

        assert removed == 1
        async with primary_factory() as session:
            assert await session.get(Analysis, session_id) is None
        async with replica_factory() as session:
            assert await session.get(Analysis, session_id) is not None, "the replica must be untouched by a delete"

    async def test_delete_sha_entries_for_sessions_never_touches_replica(self, with_replica):
        _session_id, primary_factory, replica_factory = with_replica
        await delete_sha_entries_for_sessions({"from-primary-sha-session"})

        async with primary_factory() as session:
            assert await session.get(ShaIndex, "sha-x") is None
        async with replica_factory() as session:
            assert await session.get(ShaIndex, "sha-x") is not None, "the replica must be untouched by a delete"
