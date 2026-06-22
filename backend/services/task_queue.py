import asyncio
import json
import os
import time
import uuid

import structlog
from prometheus_client import Counter

from services.cache import get_redis

logger = structlog.get_logger(__name__)

_TASK_TTL = 60 * 10
_TASK_TIMEOUT = 300
_MAX_RETRIES = 3
_WORKER_COUNT = int(os.getenv("TASK_WORKERS", "3"))
_tasks: dict[str, dict] = {}
_queue: asyncio.Queue | None = None
_worker_tasks: list[asyncio.Task] = []
_prune_task: asyncio.Task | None = None

tasks_submitted = Counter("tasks_submitted_total", "Background tasks submitted")
tasks_completed = Counter("tasks_completed_total", "Background tasks completed", ["status"])


def _persist_task(task: dict) -> None:
    """Persist task state to Redis if available."""
    r = get_redis()
    if r:
        try:
            r.set(
                f"task:{task['id']}",
                json.dumps(task, default=str),
                ex=_TASK_TTL,
            )
        except Exception:
            pass


async def _worker():
    while True:
        task_id, coro = await _queue.get()
        task = _tasks.get(task_id)
        if task is None:
            _queue.task_done()
            continue
        task["status"] = "running"
        _persist_task(task)
        try:
            result = await asyncio.wait_for(coro, timeout=_TASK_TIMEOUT)
            task["result"] = result
            task["status"] = "completed"
            tasks_completed.labels(status="completed").inc()
        except asyncio.CancelledError:
            task["status"] = "cancelled"
            raise
        except asyncio.TimeoutError:
            retries = task.get("retries", _MAX_RETRIES)
            if retries > 0:
                task["retries"] = retries - 1
                task["status"] = "pending"
                delay = 2 ** (_MAX_RETRIES - retries)
                asyncio.get_event_loop().call_later(delay, lambda: _queue.put_nowait((task_id, coro)))
                logger.warning("Task timed out, retrying", task_id=task_id, retries_left=retries - 1)
            else:
                task["error"] = "Task timed out after retries"
                task["status"] = "failed"
                tasks_completed.labels(status="failed").inc()
                logger.error("Task permanently failed (timeout)", task_id=task_id)
        except Exception as exc:
            retries = task.get("retries", _MAX_RETRIES)
            if retries > 0:
                task["retries"] = retries - 1
                task["status"] = "pending"
                delay = 2 ** (_MAX_RETRIES - retries)
                asyncio.get_event_loop().call_later(delay, lambda: _queue.put_nowait((task_id, coro)))
                logger.warning("Task failed, retrying", task_id=task_id, retries_left=retries - 1)
            else:
                task["error"] = str(exc)[:500]
                task["status"] = "failed"
                tasks_completed.labels(status="failed").inc()
                logger.error("Task permanently failed", task_id=task_id, error=str(exc)[:200])
        finally:
            task["completed_at"] = time.time()
            _persist_task(task)
            _queue.task_done()


def submit(coro) -> str:
    task_id = str(uuid.uuid4())
    task = {
        "id": task_id,
        "status": "pending",
        "created_at": time.time(),
        "completed_at": None,
        "result": None,
        "error": None,
        "retries": _MAX_RETRIES,
    }
    _tasks[task_id] = task
    _persist_task(task)
    _queue.put_nowait((task_id, coro))
    tasks_submitted.inc()
    return task_id


def get_task(task_id: str) -> dict | None:
    # Check memory first
    task = _tasks.get(task_id)
    if task:
        return task
    # Fallback to Redis
    r = get_redis()
    if r:
        try:
            raw = r.get(f"task:{task_id}")
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    return None


async def _periodic_prune():
    while True:
        await asyncio.sleep(300)
        _prune_old()


async def start():
    global _queue, _worker_tasks, _prune_task
    _queue = asyncio.Queue()
    _worker_tasks = [asyncio.create_task(_worker()) for _ in range(_WORKER_COUNT)]
    _prune_task = asyncio.create_task(_periodic_prune())
    logger.info("Background task workers started", count=_WORKER_COUNT)


async def stop():
    for t in _worker_tasks:
        t.cancel()
    if _prune_task:
        _prune_task.cancel()
    for t in _worker_tasks + [_prune_task]:
        if t:
            try:
                await t
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
