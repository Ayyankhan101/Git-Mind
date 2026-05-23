import logging
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

_GIT = shutil.which("git") or "git"

logger = logging.getLogger(__name__)


def enrich_findings_with_blame(findings: list[dict], local_path: str) -> list[dict]:
    """Attach git blame info to each finding. Never raises — blame is best-effort."""
    enriched = []
    for f in findings:
        blame = _blame_line(local_path, f.get("file", ""), f.get("line_start"))
        enriched.append({**f, "blame": blame})
    return enriched


def _blame_line(local_path: str, rel_file: str, line: int | None) -> dict | None:
    if not rel_file or not line:
        return None
    # Reject absolute paths and directory traversal
    p = Path(rel_file)
    if p.is_absolute() or '..' in p.parts:
        return None
    abs_path = Path(local_path) / rel_file
    if not abs_path.exists():
        return None
    try:
        result = subprocess.run(
            [_GIT, "blame", "-L", f"{line},{line}", "--porcelain", rel_file],
            capture_output=True, text=True, timeout=8, cwd=local_path, shell=False,
        )
        if result.returncode != 0 or not result.stdout:
            return None
        return _parse_porcelain(result.stdout)
    except Exception as exc:
        logger.debug("blame failed for %s:%s — %s", rel_file, line, exc)
        return None


def _parse_porcelain(output: str) -> dict | None:
    info: dict = {}
    for raw_line in output.splitlines():
        if not info.get("commit_hash") and len(raw_line.split()) >= 3:
            parts = raw_line.split()
            info["commit_hash"] = parts[0][:8]
        elif raw_line.startswith("author "):
            info["author"] = raw_line[7:].strip()
        elif raw_line.startswith("author-mail "):
            info["author_email"] = raw_line[12:].strip().strip("<>")
        elif raw_line.startswith("author-time "):
            try:
                ts = int(raw_line[12:].strip())
                info["date"] = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
            except Exception:
                pass
        elif raw_line.startswith("summary "):
            info["commit_message"] = raw_line[8:].strip()
    return info if len(info) >= 2 else None
