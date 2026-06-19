import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models.db import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./gitmind.db")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        yield session


async def get_analysis_db(session_id: str) -> dict | None:
    from models.db import Analysis
    async with async_session_factory() as session:
        row = await session.get(Analysis, session_id)
        if row is None:
            return None
        return {
            "repo_name": row.repo_name,
            "chroma_collection_name": row.chroma_collection_name,
            "security_findings": row.security_findings or [],
            "cve_findings": row.cve_findings or [],
            "api_docs": row.api_docs or [],
            "architecture_diagram": row.architecture_diagram,
            "git_audit": row.git_audit,
            "repo_url": row.repo_url,
            "chat_history": [],
        }


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
        result = await session.execute(
            delete(Analysis).where(Analysis.saved_at < cutoff)
        )
        removed = result.rowcount
        if removed:
            await session.execute(
                delete(ShaIndex).where(
                    ShaIndex.session_id.notin_(
                        session.query(Analysis.id)
                    )
                )
            )
        await session.commit()
        return removed or 0


async def get_sha_index_entry(sha: str) -> str | None:
    from models.db import ShaIndex
    async with async_session_factory() as session:
        row = await session.get(ShaIndex, sha)
        if row is None:
            return None
        return row.session_id


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
        await session.execute(
            delete(ShaIndex).where(ShaIndex.session_id.in_(removed_ids))
        )
        await session.commit()
