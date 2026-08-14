#!/usr/bin/env python3
"""Seed the local backend SQLite DB for live share-error verification.

Inserts:
  - FRESH_ID: a public (<=24h) analysis snapshot -> GET /analysis/<id> returns 200
  - OLD_ID:   an analysis saved >24h ago         -> GET /analysis/<id> returns 401
             (hybrid-access cutoff) without a token

Requires the backend to have been started once so the schema exists, or run
against the same DATABASE_URL. Uses the backend's own models/engine.
"""
import asyncio
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from models.db import Analysis  # noqa: E402
from services.database import async_session_factory  # noqa: E402

FRESH_ID = os.environ.get("SEED_FRESH_ID", str(uuid.uuid4()))
OLD_ID = os.environ.get("SEED_OLD_ID", str(uuid.uuid4()))

SNAPSHOT = {
    "repo_name": "gitmind/sample-app",
    "repo_url": "https://github.com/gitmind/sample-app",
    "architecture_diagram": "web -> api -> workers -> postgres",
    "api_docs": [
        {"method": "GET", "route": "/api/v1/health", "description": "Health check"},
    ],
    "security_findings": [
        {
            "id": "F-001",
            "severity": "critical",
            "rule": "G401",
            "description": "Hardcoded API secret in source",
            "file": "backend/settings.py",
            "line_start": 14,
        }
    ],
    "cve_findings": [],
    "git_audit": {
        "stats": {"total": 128, "bad_messages": 9, "secrets_found": 2, "sensitive_files": 3},
        "secret_findings": [],
        "sensitive_files": [],
    },
    "solidity_audit": {"findings": []},
    "code_audit": [],
    "health": {"grade": "B", "score": 78, "breakdown": {"security": 62}},
    "head_sha": "abc123",
    "chat_history": [],
    "owner_hash": "seed",
}


async def main():
    now = time.time()
    async with async_session_factory() as session:
        session.add(Analysis(id=FRESH_ID, saved_at=now, **SNAPSHOT))
        old = dict(SNAPSHOT)
        old["repo_name"] = "gitmind/locked-repo"
        session.add(Analysis(id=OLD_ID, saved_at=now - 48 * 3600, **old))
        await session.commit()
    print(f"FRESH_ID={FRESH_ID}")
    print(f"OLD_ID={OLD_ID}")


if __name__ == "__main__":
    asyncio.run(main())
