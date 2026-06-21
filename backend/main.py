import os

import asyncio
import structlog
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# load_dotenv MUST run before any LangChain / OpenAI import
load_dotenv()

from services.session import sessions
from services.telemetry import setup_logging, setup_metrics, setup_tracing
from services.auth import AuthMiddleware
from ws.analyze import handle_analyze
from ws.crisis import handle_crisis
from routes.chat import router as chat_router
from routes.analysis import router as analysis_router
from routes.pr import router as pr_router
from routes.repos import router as repos_router
from routes.org import router as org_router
from routes.incident import router as incident_router
from routes.fix import router as fix_router

setup_logging()
logger = structlog.get_logger(__name__)

_ANALYSIS_TTL_SECONDS = 60 * 60 * 24 * 7
_periodic_prune_task = None


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError(
            "GROQ_API_KEY is not set.\n"
            "Create backend/.env with:  GROQ_API_KEY=gsk_..."
        )
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
    global _periodic_prune_task
    _periodic_prune_task = asyncio.create_task(_periodic_prune_loop())
    yield
    if _periodic_prune_task:
        _periodic_prune_task.cancel()
        try:
            await _periodic_prune_task
        except asyncio.CancelledError:
            pass
    from services.task_queue import stop as stop_task_queue
    await stop_task_queue()
    logger.info("GitMind backend shutting down")


app = FastAPI(title="GitMind API", lifespan=lifespan)
app.add_middleware(AuthMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    logger.error("Unhandled exception", path=request.url.path, error=str(exc)[:200])
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )

_CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:8002"
).split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-GH-Token"],
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


# ── Task polling ────────────────────────────────────────────────────────────

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    from services.task_queue import get_task
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
    all_ok = all(checks.values())
    result = {"status": "ok" if all_ok else "degraded"}
    if os.getenv("DEBUG"):
        checks["groq_key"] = bool(os.getenv("GROQ_API_KEY"))
        checks["semgrep"] = bool(__import__("shutil").which("semgrep"))
        try:
            from chroma_utils import _client
            _client.list_collections()
            checks["chromadb"] = True
        except Exception:
            checks["chromadb"] = False
        result["checks"] = checks
        result["sessions_active"] = len(sessions)
    return result
