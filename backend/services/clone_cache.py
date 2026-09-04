"""Clone cache — S3-compatible object storage for shallow-clone bundles.

Not a distributed-workers primitive (nothing in this codebase runs agents on
separate machines that need to share a clone — see docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md
for that discussion). This solves a narrower, real problem instead: the same
repo@sha sometimes gets cloned more than once independently — PR impact
re-triggered for the same head SHA, an org-wide CVE audit re-scanning a repo
someone already analyzed individually. Caching the clone avoids re-hitting
GitHub (bandwidth + rate limit) for exact repeats.

Gated by CLONE_CACHE_BUCKET — unset means this module is entirely inert and
agents/scanner.py behaves exactly as it did before (zero risk to the default
path). Not a system of record: treat objects as disposable. Expiry is a
bucket lifecycle rule you configure on CLONE_CACHE_BUCKET (recommended:
~7 days, matching this app's other TTLs), not tracked in-app.

Cache key: "{owner}/{repo}@{sha}.tar.gz" — a gzip tarball of the shallow
clone's working directory, .git included, so a hit is a byte-for-byte
substitute for a fresh `git clone --depth=1`: downstream consumers that
need history (git_audit, blame) keep working identically either way.
"""

import io
import os
import tarfile

import structlog

logger = structlog.get_logger(__name__)

_BUCKET = os.environ.get("CLONE_CACHE_BUCKET", "")
_ENDPOINT_URL = os.environ.get("CLONE_CACHE_ENDPOINT_URL") or None  # for R2 / MinIO / other S3-compatible stores
_client = None


def enabled() -> bool:
    return bool(_BUCKET)


def _get_client():
    global _client
    if _client is None:
        import boto3

        _client = boto3.client("s3", endpoint_url=_ENDPOINT_URL)
    return _client


def _object_key(repo_url: str, sha: str) -> str:
    owner_repo = repo_url.rstrip("/").removesuffix(".git").split("github.com/", 1)[-1]
    return f"{owner_repo}@{sha}.tar.gz"


def _safe_extract(tar: tarfile.TarFile, dest: str) -> None:
    """Reject archive members that would write outside dest.

    Mirrors the same defensive pattern routes/fix.py already uses for patch
    paths — the bucket is treated as trusted infra we configured, but this
    is cheap and closes the path-traversal class outright either way.
    """
    dest_resolved = os.path.realpath(dest)
    for member in tar.getmembers():
        member_path = os.path.realpath(os.path.join(dest, member.name))
        if member_path != dest_resolved and not member_path.startswith(dest_resolved + os.sep):
            raise ValueError(f"Clone cache archive contains unsafe path: {member.name}")
    tar.extractall(dest)  # noqa: S202 — members validated above


def try_restore(repo_url: str, sha: str, dest: str) -> bool:
    """Download and extract a cached clone into dest. Returns True on hit.

    Any failure (cache disabled, key missing, network error, bad archive) is
    treated uniformly as a miss — the caller falls back to a real `git
    clone`, so this can never make a request fail that would otherwise
    succeed.
    """
    if not enabled():
        return False
    key = _object_key(repo_url, sha)
    try:
        client = _get_client()
        buf = io.BytesIO()
        client.download_fileobj(_BUCKET, key, buf)
        buf.seek(0)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            _safe_extract(tar, dest)
        logger.info("Clone cache hit", key=key)
        return True
    except Exception as exc:
        logger.debug("Clone cache miss for %s: %s", key, str(exc)[:150])
        return False


def store(repo_url: str, sha: str, local_path: str) -> None:
    """Best-effort upload of a completed clone. Never raises — a failed
    upload just means the next request for this repo@sha clones fresh too,
    same as today."""
    if not enabled():
        return
    key = _object_key(repo_url, sha)
    try:
        client = _get_client()
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(local_path, arcname=".")
        buf.seek(0)
        client.upload_fileobj(buf, _BUCKET, key)
        logger.debug("Clone cache stored", key=key)
    except Exception as exc:
        logger.debug("Clone cache store failed for %s: %s", key, str(exc)[:150])
