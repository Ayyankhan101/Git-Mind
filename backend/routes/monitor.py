import asyncio
import re
import time
import uuid

import structlog
from fastapi import APIRouter, Request

from models.requests import MonitorSubscribeRequest
from services.auth import hash_token, require_gh_token
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit

logger = structlog.get_logger(__name__)
router = APIRouter()

_GH_URL_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?$")


@router.post("/monitor/subscribe")
async def subscribe_repo(req: MonitorSubscribeRequest, request: Request):
    token = require_gh_token(request)
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("monitor", client_ip))[0]:
        return await rate_limit_response("monitor", client_ip)

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
                email_recipients=req.email_recipients,
                score_delta_threshold=req.score_delta_threshold,
                alert_on_new_findings=req.alert_on_new_findings,
                created_at=time.time(),
            )
        )
        await session.commit()

    asyncio.create_task(_trigger_initial_check(repo_url, monitor_id))

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
                "email_recipients": r.email_recipients,
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
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("monitor", client_ip))[0]:
        return await rate_limit_response("monitor", client_ip)

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


async def _trigger_initial_check(repo_url: str, monitor_id: str):
    """Run the first analysis for a newly subscribed repo.

    Establishes the baseline SHA and health score.
    No alerts are sent — there is no previous baseline to compare against.
    """
    import time as _time

    from sqlalchemy import select

    from models.db import MonitoredRepo
    from services.database import async_session_factory
    from services.sha_cache import get_remote_sha

    try:
        current_sha = await asyncio.to_thread(get_remote_sha, repo_url)
        if not current_sha:
            logger.warning("Monitor initial check: could not fetch SHA", repo=repo_url)
            return

        from routes.analyze import _run_analysis

        session_id: str = str(uuid.uuid4())
        result = await _run_analysis(repo_url, None, session_id)

        if result.get("error"):
            logger.error("Monitor initial check: analysis failed", repo=repo_url, error=result["error"][:200])
            session_id = ""

        async with async_session_factory() as session:
            repo = await session.execute(select(MonitoredRepo).where(MonitoredRepo.id == monitor_id))
            repo = repo.scalar_one_or_none()
            if repo:
                repo.last_sha = current_sha
                repo.last_session_id = session_id
                repo.last_check_at = _time.time()
                await session.commit()

        logger.info("Monitor initial check complete", repo=repo_url, session=session_id)
    except Exception as exc:
        logger.error("Monitor initial check failed", repo=repo_url, error=str(exc)[:200])
