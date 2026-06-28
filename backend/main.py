import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# load_dotenv MUST run before any LangChain / OpenAI import
load_dotenv()

# Sentry init — only if DSN is set
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "production"),
        attach_stacktrace=True,
        send_default_pii=False,
    )

from routes.analysis import router as analysis_router  # noqa: E402
from routes.analyze import router as analyze_router  # noqa: E402
from routes.chat import router as chat_router  # noqa: E402
from routes.fix import router as fix_router  # noqa: E402
from routes.github_webhook import router as github_webhook_router  # noqa: E402
from routes.incident import router as incident_router  # noqa: E402
from routes.monitor import router as monitor_router  # noqa: E402
from routes.org import router as org_router  # noqa: E402
from routes.pr import router as pr_router  # noqa: E402
from routes.repos import router as repos_router  # noqa: E402
from routes.webhook import router as webhook_router  # noqa: E402
from services.auth import AuthMiddleware  # noqa: E402
from services.correlation import CorrelationMiddleware  # noqa: E402
from services.session import _sessions as sessions  # noqa: E402
from services.telemetry import setup_logging, setup_metrics, setup_tracing  # noqa: E402
from ws.analyze import handle_analyze  # noqa: E402
from ws.crisis import handle_crisis  # noqa: E402

setup_logging()
logger = structlog.get_logger(__name__)

_ANALYSIS_TTL_SECONDS = 60 * 60 * 24 * 7
_periodic_prune_task = None
_monitoring_task = None


async def _periodic_prune_loop():
    while True:
        await asyncio.sleep(30 * 60)  # every 30 minutes
        await _prune_old_analyses()
        try:
            from chroma_utils import prune_old_collections

            removed = await asyncio.to_thread(prune_old_collections)
            if removed:
                logger.info("Periodic: pruned old ChromaDB collections", count=removed)
        except Exception as exc:
            logger.warning("Could not prune old collections", error=str(exc))


async def _prune_old_analyses() -> None:
    import time

    from services.database import delete_expired_analyses

    cutoff = time.time() - _ANALYSIS_TTL_SECONDS
    try:
        removed = await delete_expired_analyses(cutoff)
        if removed:
            logger.info("Pruned expired analysis files", count=removed)
    except Exception as exc:
        logger.warning("Could not prune old analyses", error=str(exc))


async def _monitoring_loop():
    interval = int(os.getenv("MONITOR_INTERVAL_SECONDS", "3600"))
    logger.info("Monitoring loop started", interval_seconds=interval)
    while True:
        await _run_monitoring_checks()
        await asyncio.sleep(interval)


async def _run_monitoring_checks():
    import time

    from sqlalchemy import select

    from models.db import MonitoredRepo
    from services.database import async_session_factory, get_previous_analysis_db
    from services.sha_cache import get_remote_sha

    try:
        async with async_session_factory() as session:
            repos = await session.execute(select(MonitoredRepo))
            monitored = repos.scalars().all()
    except Exception as exc:
        logger.error("Failed to fetch monitored repos", error=str(exc))
        return

    for repo in monitored:
        try:
            current_sha = await asyncio.to_thread(get_remote_sha, repo.repo_url)
            if not current_sha or current_sha == repo.last_sha:
                continue

            logger.info(
                "Monitor: SHA changed, triggering analysis",
                repo=repo.repo_url,
                old=(repo.last_sha or "")[:8],
                new=current_sha[:8],
            )

            from routes.analyze import _run_analysis

            session_id = str(__import__("uuid").uuid4())
            result = await _run_analysis(repo.repo_url, None, session_id)

            if result.get("error"):
                logger.error("Monitor: analysis failed", repo=repo.repo_url, error=result["error"][:200])
                session_id = None
            else:
                if repo.last_session_id and repo.slack_webhook_url:
                    prev = await get_previous_analysis_db(repo.repo_url, exclude_session=session_id)
                    curr_health = (result.get("health") or {}).get("score", 0)
                    prev_health = (prev.get("health") or {}).get("score", 0) if prev else 0
                    score_delta = curr_health - prev_health

                    curr_sec = len(result.get("security_findings", []))
                    prev_sec = len(prev.get("security_findings", [])) if prev else 0
                    new_findings = curr_sec - prev_sec

                    significant = score_delta < repo.score_delta_threshold or (
                        repo.alert_on_new_findings and new_findings > 0
                    )

                    if significant:
                        await _send_monitor_alert(repo, score_delta, new_findings, curr_health, session_id)

            async with async_session_factory() as session:
                repo.last_sha = current_sha
                repo.last_session_id = session_id
                repo.last_check_at = time.time()
                await session.commit()

            logger.info("Monitor: analysis complete", repo=repo.repo_url, session=session_id)

        except Exception as exc:
            logger.error("Monitor check failed", repo=repo.repo_url, error=str(exc)[:200])


async def _send_monitor_alert(repo, score_delta, new_findings, curr_health, session_id):
    import httpx

    dashboard_url = f"https://gitmind-peach.vercel.app/?share={session_id}"
    msg = f"⚠️ *GitMind Alert: {repo.repo_name}*\nHealth score changed by {score_delta:+d} → now {curr_health}/100\n"
    if new_findings > 0:
        msg += f"New security findings: +{new_findings}\n"
    msg += f"<{dashboard_url}|View full report>"

    if repo.slack_webhook_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(repo.slack_webhook_url, json={"text": msg})
            logger.info("Monitor alert sent (Slack)", repo=repo.repo_url)
        except Exception as exc:
            logger.warning("Monitor alert failed (Slack)", repo=repo.repo_url, error=str(exc)[:200])

    if repo.email_recipients:
        from services.email import send_alert_email

        recipients = [e.strip() for e in repo.email_recipients.split(",") if e.strip()]
        if recipients:
            await send_alert_email(
                recipients=recipients,
                repo_name=repo.repo_name,
                score_delta=score_delta,
                curr_health=curr_health,
                new_findings=new_findings,
                dashboard_url=dashboard_url,
            )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY is not set.\nCreate backend/.env with:  GROQ_API_KEY=gsk_...")
    if not os.getenv("GITHUB_APP_WEBHOOK_SECRET"):
        raise RuntimeError(
            "GITHUB_APP_WEBHOOK_SECRET is not set — webhook HMAC verification cannot be enforced.\n"
            "Set it in your .env or HF Spaces secrets. Refusing to start without it."
        )
    from services.cache import close_redis, init_redis

    await init_redis()
    from services.database import init_db

    await init_db()
    logger.info("Database initialized")
    from services.task_queue import start as start_task_queue

    await start_task_queue()
    logger.info("Background task worker started")
    await _prune_old_analyses()
    try:
        from chroma_utils import prune_old_collections

        removed = await asyncio.to_thread(prune_old_collections)
        if removed:
            logger.info("Startup: pruned old ChromaDB collections", count=removed)
    except Exception as exc:
        logger.warning("Could not prune old collections", error=str(exc))
    logger.info("GitMind backend starting — GROQ_API_KEY present")
    global _periodic_prune_task, _monitoring_task
    _periodic_prune_task = asyncio.create_task(_periodic_prune_loop())
    _monitoring_task = asyncio.create_task(_monitoring_loop())
    yield
    if _periodic_prune_task:
        _periodic_prune_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _periodic_prune_task
    if _monitoring_task:
        _monitoring_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _monitoring_task
    from services.task_queue import stop as stop_task_queue

    await stop_task_queue()
    await close_redis()
    logger.info("GitMind backend shutting down")


app = FastAPI(title="GitMind API", version="1.1.0", lifespan=lifespan)
app.add_middleware(CorrelationMiddleware)
app.add_middleware(AuthMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    from fastapi.responses import JSONResponse

    logger.error("Unhandled exception", path=request.url.path, error=str(exc)[:200])
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:8002",
    ).split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-GH-Token", "X-Request-ID", "Authorization"],
)

# ── Telemetry ───────────────────────────────────────────────────────────────

setup_metrics(app)
setup_tracing(app)

# ── WebSocket routes ────────────────────────────────────────────────────────

app.websocket("/ws/analyze")(handle_analyze)
app.websocket("/ws/crisis")(handle_crisis)

# ── REST routes ─────────────────────────────────────────────────────────────

app.include_router(chat_router)
app.include_router(analysis_router)
app.include_router(pr_router)
app.include_router(repos_router)
app.include_router(org_router)
app.include_router(incident_router)
app.include_router(fix_router)
app.include_router(analyze_router)
app.include_router(webhook_router)
app.include_router(github_webhook_router)
app.include_router(monitor_router)


# ── Task polling ────────────────────────────────────────────────────────────


@app.get("/task/{task_id}")
async def get_task_status(task_id: str, request: Request):
    from services.auth import get_gh_token, get_service_key, require_gh_token_or_service_key
    from services.rate_limit_response import rate_limit_response
    from services.rate_limiter import check_rate_limit
    from services.task_queue import get_task

    require_gh_token_or_service_key(request)
    gh_token = get_gh_token(request)
    svc_key = get_service_key(request)
    identity: str = gh_token or svc_key or ""
    allowed, remaining, retry_after = await check_rate_limit("task", identity, service_key=svc_key)
    if not allowed:
        return await rate_limit_response("task", identity)
    task = get_task(task_id)
    if task is None:
        return {"error": "Task not found"}
    return {
        "id": task["id"],
        "status": task["status"],
        "result": task.get("result"),
        "error": task.get("error"),
    }


# ── Health check ────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    checks: dict[str, bool] = {}
    checks["database"] = True
    try:
        from services.database import async_session_factory

        async with async_session_factory() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            checks["database"] = True
    except Exception:
        checks["database"] = False
    checks["git"] = bool(__import__("shutil").which("git"))
    from services.cache import get_redis

    r = get_redis()
    if r:
        try:
            await r.ping()
            checks["redis"] = True
        except Exception:
            checks["redis"] = False
    else:
        checks["redis"] = False
    mandatory = {k: v for k, v in checks.items() if k != "redis"}
    all_ok = all(mandatory.values())
    result = {"status": "ok" if all_ok else "degraded"}
    result["checks"] = checks
    result["sessions_active"] = len(sessions)
    if os.getenv("DEBUG"):
        checks["groq_key"] = bool(os.getenv("GROQ_API_KEY"))
        checks["semgrep"] = bool(__import__("shutil").which("semgrep"))
        try:
            from chroma_utils import _client

            _client.list_collections()
            checks["chromadb"] = True
        except Exception:
            checks["chromadb"] = False
    return result
