import logging
import os
import tempfile
from pathlib import Path

import git

logger = logging.getLogger(__name__)

_ALLOWED_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".go", ".rb", ".php",
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
}

_SKIP_DIRS = {
    "node_modules", "__pycache__", ".git", "venv", ".venv",
    "dist", "build", ".next", "target", "vendor",
    ".tox", "coverage", ".pytest_cache", "eggs", ".eggs",
}

_MAX_TOTAL_BYTES = 50 * 1024 * 1024   # 50 MB hard cap across all files
_MAX_FILE_BYTES  = 100 * 1024          # 100 KB — skips minified / generated files
_MAX_FILES       = 300


def clone_and_scan(repo_url: str) -> dict:
    """
    Shallow-clone a public GitHub repo and return the file inventory.

    Returns a dict with keys: local_path, file_tree, file_contents, repo_name.
    Raises ValueError for bad URLs, RuntimeError for clone failures.
    """
    _validate_url(repo_url)

    dest = tempfile.mkdtemp(prefix="gitmind_")
    logger.info("Cloning %s → %s", repo_url, dest)

    head_sha = None
    try:
        repo = git.Repo.clone_from(repo_url, dest, depth=1, no_single_branch=True)
        head_sha = repo.head.commit.hexsha
        repo.close()   # prevents resource leak on Windows
    except git.exc.GitCommandError as exc:
        raise RuntimeError(f"Git clone failed: {exc}") from exc

    file_tree:     list[str]       = []
    file_contents: dict[str, str]  = {}
    total_bytes = 0
    dest_path   = Path(dest)

    cap_reached = False
    for root, dirs, files in os.walk(dest):
        if cap_reached:
            break
        # Prune irrelevant directories in-place (modifies dirs to control os.walk)
        dirs[:] = sorted(
            d for d in dirs
            if d not in _SKIP_DIRS and not d.startswith(".")
        )

        for filename in sorted(files):
            if len(file_tree) >= _MAX_FILES:
                logger.warning("300-file cap reached — stopping walk")
                cap_reached = True
                break

            ext = Path(filename).suffix.lower()
            if ext not in _ALLOWED_EXTENSIONS:
                continue

            filepath = Path(root) / filename
            # Always use forward slashes — semgrep and LLMs expect POSIX paths
            rel = filepath.relative_to(dest_path).as_posix()
            file_tree.append(rel)

            try:
                size = filepath.stat().st_size
                if size > _MAX_FILE_BYTES:
                    continue                    # skip large / generated files
                total_bytes += size
                if total_bytes > _MAX_TOTAL_BYTES:
                    logger.warning("50 MB cap reached — stopping file reads")
                    break
                file_contents[rel] = filepath.read_text(errors="ignore")
            except OSError:
                pass   # unreadable file — skip silently

    repo_name = repo_url.rstrip("/").split("/")[-1].removesuffix(".git")
    logger.info(
        "Scan complete — %d files in tree, %d readable, repo=%s",
        len(file_tree), len(file_contents), repo_name,
    )

    return {
        "local_path":    dest,
        "file_tree":     file_tree,
        "file_contents": file_contents,
        "repo_name":     repo_name,
        "head_sha":      head_sha,
    }


def _validate_url(repo_url: str) -> None:
    if not repo_url.startswith("https://github.com/"):
        raise ValueError(
            f"Only public GitHub URLs are supported (https://github.com/...). Got: {repo_url!r}"
        )
