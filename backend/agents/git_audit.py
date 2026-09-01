import re

import httpx
import structlog
from gitmind_core import scan_secrets, scan_sensitive_files

logger = structlog.get_logger(__name__)

_OWNER_REPO_RE = re.compile(r"github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")

# Bad commit message patterns (case-insensitive, full-string match)
_BAD_MSG_RE = re.compile(
    r"^(?:fix|wip|temp|tmp|test|update|change|changes|commit|asdf+|aaa+|"
    r"foo|bar|baz|xyz|lol|ok|done|initial|init|first commit|add files?|"
    r"minor changes?|misc|stuff|things|[.\-_!]+|"
    r"updating (?:stuff|things|files?|code)|"
    r"some (?:changes?|fixes?|updates?)|"
    r"various (?:changes?|fixes?|updates?)|"
    r"small (?:changes?|fixes?|updates?)|"
    r"more (?:changes?|fixes?|updates?)|"
    r"cleanup|clean up|refactor|work in progress|in progress|progress|"
    r"checkpoint|snapshot|backup|save|saving|saved)$",
    re.IGNORECASE,
)


def run_git_audit(
    repo_url: str,
    file_tree: list,
    file_contents: dict,
    token: str | None = None,
) -> dict:
    m = _OWNER_REPO_RE.search(repo_url)
    if not m:
        return _empty()

    owner, repo = m.group(1), m.group(2)
    commits = _fetch_commits(owner, repo, token)
    sensitive_files = scan_sensitive_files(file_tree)
    secret_findings = scan_secrets(file_contents)

    bad = sum(1 for c in commits if c["msg_quality"] == "bad")
    warn = sum(1 for c in commits if c["msg_quality"] == "warn")

    return {
        "commits": commits,
        "sensitive_files": sensitive_files,
        "secret_findings": secret_findings,
        "stats": {
            "total": len(commits),
            "bad_messages": bad,
            "warn_messages": warn,
            "secrets_found": len(secret_findings),
            "sensitive_files": len(sensitive_files),
        },
    }


def _fetch_commits(owner: str, repo: str, token: str | None) -> list:
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits",
                params={"per_page": 100},
                headers=headers,
            )
            if resp.is_error:
                logger.warning("GitHub commits API returned %d", resp.status_code)
                return []
            raw = resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch commits: %s", exc)
        return []

    out = []
    for c in raw:
        commit = c.get("commit", {})
        msg = (commit.get("message") or "").strip()
        first = msg.split("\n")[0].strip()
        body = "\n".join(msg.split("\n")[1:]).strip()
        author = commit.get("author", {})
        out.append(
            {
                "sha": (c.get("sha") or "")[:7],
                "full_sha": c.get("sha") or "",
                "message": first,
                "body": body,
                "author": author.get("name")
                or (c.get("author") or {}).get("login")
                or "unknown",
                "date": author.get("date") or "",
                "msg_quality": _classify(first),
                "url": c.get("html_url") or "",
            }
        )
    return out


def _classify(msg: str) -> str:
    if not msg or len(msg) < 3:
        return "bad"
    if _BAD_MSG_RE.match(msg):
        return "bad"
    if len(msg) < 12:
        return "warn"
    return "good"


def _empty() -> dict:
    return {
        "commits": [],
        "sensitive_files": [],
        "secret_findings": [],
        "stats": {
            "total": 0,
            "bad_messages": 0,
            "warn_messages": 0,
            "secrets_found": 0,
            "sensitive_files": 0,
        },
    }
