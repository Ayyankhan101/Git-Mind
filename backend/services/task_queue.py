"""Background task queue — Redis List backend.

Enqueue: LPUSH to 'queue:tasks'.
Dequeue: RPOP, polled on a short interval — not BRPOP. Upstash's serverless
Redis (HTTP-backed, no long-lived blocking connections) rejects blocking
commands outright regardless of ACL permissions, so BRPOP can never work
there; polling is the portable choice that works on both Upstash and a
real Redis server.
State:   Redis hash 'task:{id}' with TTL.
"""

import asyncio
import contextlib
import os
import time
import uuid
from collections.abc import Awaitable, Callable

import orjson
import structlog
from prometheus_client import Counter

from services.cache import clear_redis_degraded, get_redis, is_quota_error, mark_redis_degraded, redis_op

logger = structlog.get_logger(__name__)


class TaskQueueUnavailableError(Exception):
    """Raised when Redis is unavailable for task queue operations."""


_TASK_TTL = 60 * 10
_TASK_TIMEOUT = 300
_MAX_RETRIES = 3
_WORKER_COUNT = int(os.getenv("TASK_WORKERS", "3"))
_QUEUE_KEY = "queue:tasks"
_TASK_PREFIX = "task:"
_POLL_INTERVAL = 0.5  # seconds between empty-queue RPOP retries

# Backoff after a failed RPOP, doubling up to the cap. A flat 1s here was how a
# quota-exhausted Redis stayed exhausted: three workers retrying once a second
# is ~259k requests a day spent on calls that cannot succeed, which is more
# than half a free tier's monthly allowance burned on nothing. It also drowned
# the log — 567 of 600 lines in the production incident were this one warning,
# hiding the errors someone actually needed to read.
_ERROR_RETRY_MIN = 1.0
_ERROR_RETRY_MAX = 60.0

# A usage cap is not a transient failure; it clears on the provider's schedule,
# not ours. Park for this long between probes rather than polling a wall.
_QUOTA_RETRY_DELAY = 300.0
_worker_tasks: list[asyncio.Task] = []
_prune_task: asyncio.Task | None = None
_reap_task: asyncio.Task | None = None

# The dequeue removes a task from the queue before it runs, so if the worker
# process dies mid-task (OOM, deploy, crash) — as opposed to the task itself
# raising, which _handle_task_failure already covers — nothing re-queues it;
# it just sits at status "running" forever. _periodic_reap sweeps for that.
_REAP_INTERVAL = 60
_REAP_GRACE = 30  # on top of _TASK_TIMEOUT, for clock skew / scan latency

tasks_submitted = Counter("tasks_submitted_total", "Background tasks submitted")
tasks_completed = Counter("tasks_completed_total", "Background tasks completed", ["status"])


async def _persist_task(task: dict) -> bool:
    """Persist task state to Redis. Returns whether the write landed.

    Callers differ on how much they care: submit() must fail loudly if the task
    never got written, while a worker updating status mid-run is best-effort.
    """
    r = get_redis()
    if not r:
        return False
    written = await redis_op(
        "persist task",
        r.set,
        f"{_TASK_PREFIX}{task['id']}",
        orjson.dumps(task, default=str).decode(),
        ex=_TASK_TTL,
        default=None,
    )
    return written is not None


async def _worker():
    """Worker: poll RPOP from queue, execute task, update state."""
    r = get_redis()
    if not r:
        logger.error("No Redis — worker cannot start")
        return

    backoff = _ERROR_RETRY_MIN
    while True:
        try:
            payload = await r.rpop(_QUEUE_KEY)
            if payload is None:
                backoff = _ERROR_RETRY_MIN
                clear_redis_degraded()
                await asyncio.sleep(_POLL_INTERVAL)
                continue
            backoff = _ERROR_RETRY_MIN
            clear_redis_degraded()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # _mark_degraded logs once per episode, so a persistent outage
            # produces one line rather than one per attempt.
            mark_redis_degraded(exc)
            if is_quota_error(exc):
                await asyncio.sleep(_QUOTA_RETRY_DELAY)
            else:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _ERROR_RETRY_MAX)
            continue

        try:
            entry = orjson.loads(payload)
            task_id = entry["task_id"]
            retries_left = entry.get("retries", _MAX_RETRIES)
        except Exception as exc:
            logger.warning("Invalid queue entry", error=str(exc)[:100])
            continue

        # Load task state. Degrades to None, which the existing falsy check
        # already treats as "skip this entry".
        raw = await redis_op("load task state", r.get, f"{_TASK_PREFIX}{task_id}")
        if not raw:
            continue
        task = orjson.loads(raw)
        task["status"] = "running"
        task["running_since"] = time.time()
        await _persist_task(task)

        # Deserialize coroutine factory
        # We store the task as a pickled callable via orjson (not supported).
        # Instead, we look up a registry of known task types.
        coro_factory = _TASK_REGISTRY.get(task.get("type"))
        if coro_factory is None:
            task["status"] = "failed"
            task["error"] = f"Unknown task type: {task.get('type')}"
            await _persist_task(task)
            tasks_completed.labels(status="failed").inc()
            continue

        try:
            coro = coro_factory(task.get("args", {}))
            result = await asyncio.wait_for(coro, timeout=_TASK_TIMEOUT)
            task["result"] = result
            task["status"] = "completed"
            tasks_completed.labels(status="completed").inc()
        except asyncio.CancelledError:
            task["status"] = "cancelled"
            raise
        except (TimeoutError, Exception) as exc:
            error_msg = "Task timed out after retries" if isinstance(exc, TimeoutError) else str(exc)[:500]
            log_fn = logger.error if isinstance(exc, TimeoutError) and retries_left <= 0 else logger.warning
            await _handle_task_failure(task, task_id, retries_left, r, error_msg, log_fn)
        finally:
            task["completed_at"] = time.time()
            await _persist_task(task)


async def _handle_task_failure(task: dict, task_id: str, retries_left: int, r, error_msg: str, log_fn) -> None:
    """Handle task failure with retry logic."""
    if retries_left > 0:
        task["retries"] = retries_left - 1
        task["status"] = "pending"
        delay = 2 ** (_MAX_RETRIES - retries_left)
        await asyncio.sleep(delay)
        # Best-effort: if the requeue is lost, _periodic_reap sweeps the task up
        # later rather than the worker dying on the way out of a failure path.
        await redis_op(
            "requeue failed task",
            r.lpush,
            _QUEUE_KEY,
            orjson.dumps(
                {
                    "task_id": task_id,
                    "type": task.get("type"),
                    "args": task.get("args", {}),
                    "retries": retries_left - 1,
                }
            ).decode(),
        )
        log_fn("Task failed, retrying", task_id=task_id, retries_left=retries_left - 1)
    else:
        task["error"] = error_msg
        task["status"] = "failed"
        tasks_completed.labels(status="failed").inc()
        log_fn("Task permanently failed", task_id=task_id, error=error_msg[:200])


# ── Task registry ──────────────────────────────────────────────────────────────
# Maps task type string → async callable that returns a coroutine.
# Add new task types here as they are needed.

# ── Built-in task factories ────────────────────────────────────────────────────


async def _run_analysis_task(args: dict) -> dict:
    """Run the full analysis pipeline for a repo."""
    from routes.analyze import _run_analysis

    return await _run_analysis(args["repo_url"], args.get("gh_token"), args["session_id"])


async def _run_pr_impact_task(args: dict) -> dict:
    """Compute PR impact analysis."""
    from routes.pr import _compute_pr_impact

    return await _compute_pr_impact(
        repo_url=args["repo_url"],
        token=args.get("token"),
        head_ref=args["head_ref"],
        base_session=args["base_session"],
        pr_meta=args["pr_meta"],
        pr_diff=args["pr_diff"],
    )


_TASK_REGISTRY: dict[str, Callable[..., Awaitable[dict]]] = {
    "run_analysis": _run_analysis_task,
    "compute_pr_impact": _run_pr_impact_task,
}


async def submit(task_type: str, args: dict | None = None) -> str:
    """Submit a background task to Redis queue.

    ``task_type`` must be a key in ``_TASK_REGISTRY``.
    ``args`` is a JSON-serializable dict passed to the factory.
    Returns task_id.
    """
    r = get_redis()
    if not r:
        raise TaskQueueUnavailableError("Redis unavailable — cannot submit tasks")

    task_id = str(uuid.uuid4())
    task = {
        "id": task_id,
        "type": task_type,
        "args": args or {},
        "status": "pending",
        "created_at": time.time(),
        "completed_at": None,
        "result": None,
        "error": None,
        "retries": _MAX_RETRIES,
    }
    # submit() stays loud on purpose. Everywhere else in this module a lost
    # Redis write costs a status update or a retry; here it would mean handing
    # the caller a task_id for work that was never queued and will never run.
    # The caller already handles TaskQueueUnavailableError from the None check
    # above, so raise rather than degrade.
    if not await _persist_task(task):
        raise TaskQueueUnavailableError(f"Redis rejected the task write — cannot submit {task_type}")
    entry = {
        "task_id": task_id,
        "type": task_type,
        "args": args or {},
        "retries": _MAX_RETRIES,
    }
    try:
        await r.lpush(_QUEUE_KEY, orjson.dumps(entry).decode())
    except Exception as exc:
        mark_redis_degraded(exc)
        raise TaskQueueUnavailableError(f"Redis rejected the queue push — cannot submit {task_type}") from exc
    tasks_submitted.inc()
    logger.debug("Task submitted", task_id=task_id, type=task_type)
    return task_id


async def get_task(task_id: str) -> dict | None:
    """Load task state from Redis."""
    r = get_redis()
    if not r:
        return None
    raw = await redis_op("get task", r.get, f"{_TASK_PREFIX}{task_id}")
    if raw:
        return orjson.loads(raw)
    return None


async def _periodic_prune():
    """Remove expired task hashes."""
    while True:
        await asyncio.sleep(300)
        r = get_redis()
        if not r:
            continue
        try:
            cursor = 0
            while True:
                cursor, keys = await r.scan(cursor, match=f"{_TASK_PREFIX}*", count=100)
                for key in keys:
                    ttl = await r.ttl(key)
                    if ttl == -1:
                        await r.expire(key, _TASK_TTL)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning("Prune scan failed", error=str(exc)[:100])


async def _reap_stale_task(task: dict, r) -> None:
    """Requeue (or fail) a task whose worker crashed mid-run.

    Mirrors _handle_task_failure's retry bookkeeping, minus the exponential
    backoff sleep — the task has already been stuck far longer than any
    backoff window, so there's nothing to gain by waiting further.
    """
    task_id = task["id"]
    retries_left = task.get("retries", 0)
    if retries_left > 0:
        task["retries"] = retries_left - 1
        task["status"] = "pending"
        task.pop("running_since", None)
        await _persist_task(task)
        await redis_op(
            "requeue reaped task",
            r.lpush,
            _QUEUE_KEY,
            orjson.dumps(
                {
                    "task_id": task_id,
                    "type": task.get("type"),
                    "args": task.get("args", {}),
                    "retries": retries_left - 1,
                }
            ).decode(),
        )
        logger.warning("Reaped orphaned task, requeued", task_id=task_id, retries_left=retries_left - 1)
    else:
        task["status"] = "failed"
        task["error"] = "Worker crashed while running this task (reaped) — retries exhausted"
        task["completed_at"] = time.time()
        await _persist_task(task)
        tasks_completed.labels(status="failed").inc()
        logger.error("Reaped orphaned task, retries exhausted", task_id=task_id)


async def _periodic_reap():
    """Detect tasks stuck at status='running' — the worker that owned them
    died before it could update their state — and requeue or fail them."""
    while True:
        await asyncio.sleep(_REAP_INTERVAL)
        r = get_redis()
        if not r:
            continue
        try:
            cursor = 0
            now = time.time()
            while True:
                cursor, keys = await r.scan(cursor, match=f"{_TASK_PREFIX}*", count=100)
                for key in keys:
                    raw = await r.get(key)
                    if not raw:
                        continue
                    task = orjson.loads(raw)
                    if task.get("status") != "running":
                        continue
                    running_since = task.get("running_since", 0)
                    if now - running_since > _TASK_TIMEOUT + _REAP_GRACE:
                        await _reap_stale_task(task, r)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning("Reap scan failed", error=str(exc)[:100])


async def start():
    """Start worker tasks."""
    global _worker_tasks, _prune_task, _reap_task
    r = get_redis()
    if not r:
        logger.error("No Redis — task queue not started")
        return
    _worker_tasks = [asyncio.create_task(_worker()) for _ in range(_WORKER_COUNT)]
    _prune_task = asyncio.create_task(_periodic_prune())
    _reap_task = asyncio.create_task(_periodic_reap())
    logger.info("Background task workers started", count=_WORKER_COUNT)


async def stop():
    """Cancel all workers."""
    for t in _worker_tasks:
        t.cancel()
    if _prune_task:
        _prune_task.cancel()
    if _reap_task:
        _reap_task.cancel()
    for t in _worker_tasks + [_prune_task, _reap_task]:
        if t:
            with contextlib.suppress(asyncio.CancelledError):
                await t
