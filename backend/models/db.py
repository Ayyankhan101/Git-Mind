from sqlalchemy import JSON, Float, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    repo_name: Mapped[str] = mapped_column(String(255), default="")
    repo_url: Mapped[str] = mapped_column(String(1024), default="")
    architecture_diagram: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_docs: Mapped[list | None] = mapped_column(JSON, nullable=True)
    security_findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    cve_findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    chroma_collection_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    git_audit: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    health: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    head_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    saved_at: Mapped[float] = mapped_column(Float, default=0.0)
    expires_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class ShaIndex(Base):
    __tablename__ = "sha_index"

    sha: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
