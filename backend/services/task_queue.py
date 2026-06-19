import asyncio
import time
import uuid

import structlog
from prometheus_client import Counter

logger = structlog.get_logger(__name__)

_TASK_TTL = 60 * 10
_tasks: dict[str, dict] = {}
_queue: asyncio.Queue | None = None
_worker_task: asyncio.Task | None = None

tasks_submitted = Counter("tasks_submitted_total", "Background tasks submitted")
tasks_completed = Counter("tasks_completed_total", "Background tasks completed", ["status"])


async def _worker():
    while True:
        task_id, coro = await _queue.get()
        task = _tasks.get(task_id)
        if task is None:
            _queue.task_done()
            continue
        task["status"] = "running"
        try:
            result = await coro
            task["result"] = result
            task["status"] = "completed"
            tasks_completed.labels(status="completed").inc()
        except asyncio.CancelledError:
            task["status"] = "cancelled"
            raise
        except Exception as exc:
            task["error"] = str(exc)
            task["status"] = "failed"
            tasks_completed.labels(status="failed").inc()
        finally:
            task["completed_at"] = time.time()
            _queue.task_done()


def submit(coro) -> str:
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "id": task_id,
        "status": "pending",
        "created_at": time.time(),
        "completed_at": None,
        "result": None,
        "error": None,
    }
    _queue.put_nowait((task_id, coro))
    tasks_submitted.inc()
    return task_id


def get_task(task_id: str) -> dict | None:
    return _tasks.get(task_id)


async def start():
    global _queue, _worker_task
    _queue = asyncio.Queue()
    _worker_task = asyncio.create_task(_worker())
    _prune_old()
    logger.info("Background task worker started")


async def stop():
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass


def _prune_old():
    cutoff = time.time() - _TASK_TTL
    to_delete = [
        tid for tid, t in _tasks.items()
        if (t.get("completed_at") or t["created_at"]) < cutoff
    ]
    for tid in to_delete:
        del _tasks[tid]
    if to_delete:
        logger.debug("Pruned old background tasks", count=len(to_delete))
