import re
import time
import uuid

import structlog
from fastapi import APIRouter, Request

from models.requests import MonitorSubscribeRequest
from services.auth import hash_token, require_gh_token

logger = structlog.get_logger(__name__)
router = APIRouter()

_GH_URL_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?$")


@router.post("/monitor/subscribe")
async def subscribe_repo(req: MonitorSubscribeRequest, request: Request):
    token = require_gh_token(request)
    repo_url = req.repo_url.strip()
    if not _GH_URL_RE.match(repo_url):
        return {"error": "Invalid GitHub URL — must be https://github.com/{owner}/{repo}"}

    from sqlalchemy import select

    from models.db import MonitoredRepo
    from services.database import async_session_factory

    async with async_session_factory() as session:
        existing = await session.execute(select(MonitoredRepo).where(MonitoredRepo.repo_url == repo_url))
        if existing.scalar_one_or_none():
            return {"error": "Repo already monitored — unsubscribe first"}

        monitor_id = str(uuid.uuid4())
        owner_hash = hash_token(token)
        repo_name = repo_url.rstrip("/").split("/")[-1]

        session.add(
            MonitoredRepo(
                id=monitor_id,
                repo_url=repo_url,
                repo_name=repo_name,
                owner_hash=owner_hash,
                slack_webhook_url=req.slack_webhook_url,
                schedule_cron=req.schedule_cron,
                score_delta_threshold=req.score_delta_threshold,
                alert_on_new_findings=req.alert_on_new_findings,
                created_at=time.time(),
            )
        )
        await session.commit()

    logger.info("Repo subscribed to monitoring", monitor_id=monitor_id, repo=repo_url)
    return {"ok": True, "monitor_id": monitor_id}


@router.get("/monitor/status")
async def monitor_status(request: Request):
    token = require_gh_token(request)
    from sqlalchemy import select

    from models.db import MonitoredRepo
    from services.database import async_session_factory

    owner_hash = hash_token(token)
    async with async_session_factory() as session:
        result = await session.execute(select(MonitoredRepo).where(MonitoredRepo.owner_hash == owner_hash))
        repos = result.scalars().all()

    return {
        "repos": [
            {
                "id": r.id,
                "repo_url": r.repo_url,
                "repo_name": r.repo_name,
                "slack_webhook_url": bool(r.slack_webhook_url),
                "schedule_cron": r.schedule_cron,
                "score_delta_threshold": r.score_delta_threshold,
                "alert_on_new_findings": r.alert_on_new_findings,
                "last_sha": r.last_sha,
                "last_session_id": r.last_session_id,
                "last_check_at": r.last_check_at,
                "created_at": r.created_at,
            }
            for r in repos
        ]
    }


@router.delete("/monitor/{monitor_id}")
async def unsubscribe_repo(monitor_id: str, request: Request):
    token = require_gh_token(request)
    from sqlalchemy import delete

    from models.db import MonitoredRepo
    from services.database import async_session_factory

    owner_hash = hash_token(token)
    async with async_session_factory() as session:
        result = await session.execute(
            delete(MonitoredRepo).where(
                MonitoredRepo.id == monitor_id,
                MonitoredRepo.owner_hash == owner_hash,
            )
        )
        await session.commit()

    if result.rowcount == 0:
        return {"error": "Monitor not found or not owned by you"}

    logger.info("Repo unsubscribed from monitoring", monitor_id=monitor_id)
    return {"ok": True}
