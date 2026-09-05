import atexit
import contextlib
import os
import re
import shutil
import stat
import tempfile
import time
from pathlib import Path

import git
import structlog

logger = structlog.get_logger(__name__)

# Track active temp dirs for cleanup  {path: creation_timestamp}
_active_temp_dirs: dict[str, float] = {}


def _cleanup_at_exit() -> None:
    for path in list(_active_temp_dirs):
        _cleanup_temp_dir(path)


atexit.register(_cleanup_at_exit)

_ALLOWED_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".sol",
    ".vy",
    ".rs",
}

_SKIP_DIRS = {
    "node_modules",
    "__pycache__",
    ".git",
    "venv",
    ".venv",
    "dist",
    "build",
    ".next",
    "target",
    "vendor",
    ".tox",
    "coverage",
    ".pytest_cache",
    "eggs",
    ".eggs",
}

_MAX_TOTAL_BYTES = 50 * 1024 * 1024  # 50 MB hard cap across all files
_MAX_FILE_BYTES = 100 * 1024  # 100 KB — skips minified / generated files
_MAX_FILES = 150


def clone_and_scan(
    repo_url: str,
    token: str | None = None,
    branch: str | None = None,
    sha_hint: str | None = None,
) -> dict:
    """
    Shallow-clone a GitHub repo and return the file inventory.
    Pass `token` (PAT) to clone private repos via x-access-token auth.
    Pass `branch` to clone a specific branch (e.g. a PR head branch).
    Pass `sha_hint` when the caller already resolved the target commit (e.g.
    via `git ls-remote`, or a PR's `head.sha`) — enables the clone cache
    (services/clone_cache.py) to skip the network clone entirely on a hit.
    Inert when CLONE_CACHE_BUCKET is unset.

    Returns a dict with keys: local_path, file_tree, file_contents, repo_name.
    Raises ValueError for bad URLs, RuntimeError for clone failures.
    """
    _validate_url(repo_url)

    dest = tempfile.mkdtemp(prefix="gitmind_")
    _active_temp_dirs[dest] = time.time()

    head_sha = None
    from services.clone_cache import store, try_restore

    if sha_hint and try_restore(repo_url, sha_hint, dest):
        head_sha = sha_hint
        logger.info("Scanner: restored %s@%s from clone cache — skipped git clone", repo_url, sha_hint[:8])
    else:
        # Build authenticated clone URL for private repos
        # Use GIT_ASKPASS to avoid token appearing in URLs, process listings, or logs
        clone_url = repo_url
        _askpass_script = None
        _env = {"GIT_TERMINAL_PROMPT": "0"}
        if token:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as _askpass_script:
                _askpass_script.write(f'#!/bin/sh\necho "{token}"\n')
                _askpass_name = _askpass_script.name
            os.chmod(_askpass_name, stat.S_IRUSR | stat.S_IXUSR)
            _env["GIT_ASKPASS"] = _askpass_name
            _env["GIT_TERMINAL_PROMPT"] = "0"

        logger.info(
            "Cloning %s → %s (auth=%s, branch=%s)",
            repo_url,
            dest,
            bool(token),
            branch or "default",
        )

        clone_kwargs: dict = {"depth": 1}
        if branch:
            clone_kwargs["branch"] = branch
        else:
            clone_kwargs["no_single_branch"] = True

        # Clone with one retry: shallow clones fail on transient network/DNS
        # hiccups that usually clear within a couple of seconds. Deterministic
        # failures (repo not found, auth, HTTP 4xx) are raised immediately — no
        # retry. Each attempt gets a fresh dest so a partially-written clone can't
        # poison the retry with the "destination path already exists" error.
        max_attempts = 2
        try:
            for attempt in range(1, max_attempts + 1):
                try:
                    repo = git.Repo.clone_from(
                        clone_url,
                        dest,
                        env=_env,
                        **clone_kwargs,
                    )
                    head_sha = repo.head.commit.hexsha
                    repo.close()  # prevents resource leak on Windows
                    break
                except git.exc.GitCommandError as exc:
                    if attempt < max_attempts and _is_transient_clone_failure(exc):
                        logger.warning(
                            "Clone attempt %d/%d failed — retrying",
                            attempt,
                            max_attempts,
                            repo=repo_url,
                            stderr=(exc.stderr or "")[:200],
                        )
                        time.sleep(2)
                        shutil.rmtree(dest, ignore_errors=True)
                        os.makedirs(dest, exist_ok=True)
                    else:
                        _cleanup_temp_dir(dest)
                        raise RuntimeError(_clone_failure_message(repo_url, exc)) from exc
        finally:
            # The askpass script must outlive every retry attempt — deleting it
            # after attempt 1 would make a retried private-repo clone fail auth.
            if _askpass_script:
                with contextlib.suppress(OSError):
                    os.unlink(_askpass_name)

        if head_sha:
            store(repo_url, head_sha, dest)

    file_tree: list[str] = []
    file_contents: dict[str, str] = {}
    total_bytes = 0
    dest_path = Path(dest)

    cap_reached = False
    for root, dirs, files in os.walk(dest):
        if cap_reached:
            break
        # Prune irrelevant directories in-place (modifies dirs to control os.walk)
        dirs[:] = sorted(d for d in dirs if d not in _SKIP_DIRS and not d.startswith("."))

        for filename in sorted(files):
            if len(file_tree) >= _MAX_FILES:
                logger.warning("150-file cap reached — stopping walk")
                cap_reached = True
                break

            ext = Path(filename).suffix.lower()
            if ext not in _ALLOWED_EXTENSIONS:
                continue

            filepath = Path(root) / filename
            # Always use forward slashes — semgrep and LLMs expect POSIX paths
            rel = filepath.relative_to(dest_path).as_posix()

            try:
                size = filepath.stat().st_size
                if size > _MAX_FILE_BYTES:
                    continue  # skip large / generated files
                total_bytes += size
                if total_bytes > _MAX_TOTAL_BYTES:
                    logger.warning("50 MB cap reached — stopping file reads")
                    break
                file_contents[rel] = filepath.read_text(errors="ignore")
                file_tree.append(rel)  # only after successful read — keeps tree and contents in sync
            except OSError:
                pass  # unreadable file — skip silently

    repo_name = repo_url.rstrip("/").split("/")[-1].removesuffix(".git")
    logger.info(
        "Scan complete — %d files in tree, %d readable, repo=%s",
        len(file_tree),
        len(file_contents),
        repo_name,
    )

    return {
        "local_path": dest,
        "file_tree": file_tree,
        "file_contents": file_contents,
        "repo_name": repo_name,
        "head_sha": head_sha,
    }


_GITHUB_URL_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+/?$")

# Deterministic clone failures — raising immediately instead of retrying.
# Covers: repo missing, auth errors, HTTP 4xx (except 408 timeout / 429 rate
# limit, which can clear). Everything else (DNS, connect, timeout, 5xx) is
# treated as transient.
_NON_TRANSIENT_CLONE_RE = re.compile(
    r"repository not found"
    r"|does not exist"
    r"|not found"
    r"|could not read username"
    r"|authentication (failed|required)"
    r"|permission denied"
    r"|access denied"
    r"|invalid username or password"
    r"|terminal prompts disabled"
    r"|returned error: 4(?!0[89]|29)\d\d",
    re.IGNORECASE,
)


def _is_transient_clone_failure(exc: git.exc.GitCommandError) -> bool:
    """False for deterministic failures (404 / auth / missing repo) — no retry.

    Failures without stderr default to transient so ambiguous cases still get
    one retry.
    """
    stderr = exc.stderr or ""
    return not bool(_NON_TRANSIENT_CLONE_RE.search(stderr))


def _validate_url(repo_url: str) -> None:
    if not _GITHUB_URL_RE.match(repo_url):
        raise ValueError(f"Only public GitHub URLs are supported (https://github.com/owner/repo). Got: {repo_url!r}")


def _clone_failure_message(repo_url: str, exc: git.exc.GitCommandError) -> str:
    """Surface the git `fatal:` line (stderr) — the part that names the real cause."""
    detail = (exc.stderr or str(exc)).strip().replace("\n", " ").replace("\r", " ")
    return f"Git clone failed for {repo_url}: {detail[:400]}"


def _cleanup_temp_dir(path: str) -> None:
    """Remove a temp directory and untrack it."""
    _active_temp_dirs.pop(path, None)
    with contextlib.suppress(OSError):
        shutil.rmtree(path, ignore_errors=True)
        logger.debug("Cleaned up temp dir: %s", path)


def prune_old_temp_dirs(max_age_seconds: int = 3600) -> int:
    """Remove temp dirs older than max_age_seconds. Returns count removed."""
    now = time.time()
    removed = 0
    for path, created_at in list(_active_temp_dirs.items()):
        age = now - created_at
        if age > max_age_seconds:
            _cleanup_temp_dir(path)
            removed += 1
    if removed:
        logger.debug("Pruned old temp dirs: %d", removed)
    return removed
