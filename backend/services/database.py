import logging
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.db import Base

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:////tmp/gitmind.db")

# Pool config for PostgreSQL production
_pool_kwargs: dict = {}
if DATABASE_URL.startswith("postgresql"):
    _pool_kwargs = {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }

engine = create_async_engine(DATABASE_URL, echo=False, **_pool_kwargs)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    import subprocess

    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        logger.warning("Alembic failed (rc=%d), falling back to create_all: %s", proc.returncode, proc.stderr[:300])
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    if proc.stderr:
        logger.warning("Alembic stderr: %s", proc.stderr[:500])


def _analysis_row_to_dict(row) -> dict:
    return {
        "repo_name": row.repo_name,
        "chroma_collection_name": row.chroma_collection_name,
        "security_findings": row.security_findings or [],
        "cve_findings": row.cve_findings or [],
        "api_docs": row.api_docs or [],
        "architecture_diagram": row.architecture_diagram,
        "git_audit": row.git_audit,
        "solidity_audit": row.solidity_audit,
        "code_audit": row.code_audit,
        "health": row.health,
        "head_sha": row.head_sha,
        "repo_url": row.repo_url,
        "chat_history": row.chat_history or [],
        "owner_hash": row.owner_hash,
    }


async def get_analysis_db(session_id: str) -> dict | None:
    from models.db import Analysis

    async with async_session_factory() as session:
        row = await session.get(Analysis, session_id)
        if row is None:
            return None
        return _analysis_row_to_dict(row)


async def persist_analysis_db(session_id: str, snapshot: dict) -> None:
    from models.db import Analysis

    async with async_session_factory() as session:
        existing = await session.get(Analysis, session_id)
        if existing:
            for key, val in snapshot.items():
                setattr(existing, key, val)
        else:
            session.add(Analysis(id=session_id, **snapshot))
        await session.commit()


async def delete_expired_analyses(cutoff: float) -> int:
    from sqlalchemy import delete

    from models.db import Analysis, ShaIndex

    async with async_session_factory() as session:
        result = await session.execute(delete(Analysis).where(Analysis.saved_at < cutoff))
        removed = result.rowcount
        if removed:
            remaining = await session.execute(select(Analysis.id))
            remaining_ids = {row[0] for row in remaining.fetchall()}
            await session.execute(delete(ShaIndex).where(ShaIndex.session_id.notin_(remaining_ids)))
        await session.commit()
        return removed or 0


async def get_sha_index_entry(sha: str) -> str | None:
    from models.db import ShaIndex

    async with async_session_factory() as session:
        row = await session.get(ShaIndex, sha)
        if row is None:
            return None
        return row.session_id


async def get_previous_analysis_db(repo_url: str, exclude_session: str | None = None) -> dict | None:
    from sqlalchemy import desc

    from models.db import Analysis

    async with async_session_factory() as session:
        query = select(Analysis).where(Analysis.repo_url == repo_url)
        if exclude_session:
            query = query.where(Analysis.id != exclude_session)
        query = query.order_by(desc(Analysis.saved_at)).limit(1)
        result = await session.execute(query)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return {
            "session_id": row.id,
            "health": row.health,
            "security_findings": row.security_findings or [],
            "cve_findings": row.cve_findings or [],
            "saved_at": row.saved_at,
            "head_sha": row.head_sha,
            "repo_name": row.repo_name,
        }


async def get_analysis_history_db(repo_url: str, since: float | None = None, limit: int = 50) -> list[dict]:
    from sqlalchemy import desc

    from models.db import Analysis

    async with async_session_factory() as session:
        query = select(Analysis).where(Analysis.repo_url == repo_url, Analysis.health.isnot(None))
        if since:
            query = query.where(Analysis.saved_at >= since)
        query = query.order_by(desc(Analysis.saved_at)).limit(limit)
        result = await session.execute(query)
        rows = result.scalars().all()
        return [
            {
                "saved_at": r.saved_at,
                "health": r.health,
                "head_sha": r.head_sha,
            }
            for r in rows
        ]


async def upsert_sha_index(sha: str, session_id: str) -> None:
    from models.db import ShaIndex

    async with async_session_factory() as session:
        existing = await session.get(ShaIndex, sha)
        if existing:
            existing.session_id = session_id
        else:
            session.add(ShaIndex(sha=sha, session_id=session_id))
        await session.commit()


async def delete_sha_entries_for_sessions(removed_ids: set[str]) -> None:
    from sqlalchemy import delete

    from models.db import ShaIndex

    async with async_session_factory() as session:
        await session.execute(delete(ShaIndex).where(ShaIndex.session_id.in_(removed_ids)))
        await session.commit()
