import subprocess

import structlog

logger = structlog.get_logger(__name__)


def get_remote_sha(repo_url: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--quiet", "--exit-code", "--", repo_url, "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            shell=False,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout.split()[0]
    except Exception:
        pass
    return None


async def find_cached_snapshot(repo_url: str, sha: str) -> dict | None:
    from services.database import get_analysis_db, get_sha_index_entry

    session_id = await get_sha_index_entry(sha)
    if not session_id:
        return None

    snap = await get_analysis_db(session_id)
    if snap and snap.get("repo_url") == repo_url:
        return snap
    return None


async def update_sha_index(sha: str, session_id: str) -> None:
    from services.database import upsert_sha_index

    try:
        await upsert_sha_index(sha, session_id)
    except Exception as exc:
        logger.warning("Could not update SHA index", error=str(exc))
