import logging
import re

import httpx

logger = logging.getLogger(__name__)

_OWNER_REPO_RE = re.compile(r'github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$')

_SENSITIVE_FILE_RE = re.compile(
    r'(?i)(^|/)(\.env(\.|$)|credentials?\.json|secrets?\.(yaml|yml|json|toml)|'
    r'.*\.pem$|.*\.key$|.*\.p12$|.*\.pfx$|id_rsa|id_dsa|id_ecdsa|id_ed25519|'
    r'\.netrc$|\.aws/credentials|service.?account.*\.json|.*\.keystore$)'
)

_SECRET_PATTERNS = [
    (re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY'), "Private key"),
    (re.compile(r'AKIA[0-9A-Z]{16}'), "AWS Access Key ID"),
    (re.compile(r'(?i)(?:password|passwd|pwd)\s*=\s*["\'][^"\']{6,}["\']'), "Hardcoded password"),
    (re.compile(r'(?i)(?:api[_-]?key|apikey)\s*=\s*["\'][^"\']{8,}["\']'), "Hardcoded API key"),
    (re.compile(r'(?i)(?:secret|token)\s*=\s*["\'][^"\']{8,}["\']'), "Hardcoded secret/token"),
    (re.compile(r'ghp_[a-zA-Z0-9]{36}'), "GitHub Personal Access Token"),
    (re.compile(r'gsk_[a-zA-Z0-9_]{48}'), "Groq API Key"),
    (re.compile(r'sk-[a-zA-Z0-9]{48}'), "OpenAI API Key"),
    (re.compile(r'(?i)mongodb(?:\+srv)?://[^@\s]+@'), "MongoDB connection string with credentials"),
    (re.compile(r'(?i)postgres(?:ql)?://[^@\s]+:[^@\s]+@'), "PostgreSQL connection string with credentials"),
]

# Skip false positives in test / example / placeholder files
_SKIP_PATH_RE = re.compile(r'(?i)(test|spec|mock|fixture|example|sample|\.example|placeholder)')

# Bad commit message patterns (case-insensitive, full-string match)
_BAD_MSG_RE = re.compile(
    r'^(?:fix|wip|temp|tmp|test|update|change|changes|commit|asdf+|aaa+|'
    r'foo|bar|baz|xyz|lol|ok|done|initial|init|first commit|add files?|'
    r'minor changes?|misc|stuff|things|[.\-_!]+|'
    r'updating (?:stuff|things|files?|code)|'
    r'some (?:changes?|fixes?|updates?)|'
    r'various (?:changes?|fixes?|updates?)|'
    r'small (?:changes?|fixes?|updates?)|'
    r'more (?:changes?|fixes?|updates?)|'
    r'cleanup|clean up|refactor|work in progress|in progress|progress|'
    r'checkpoint|snapshot|backup|save|saving|saved)$',
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
    commits         = _fetch_commits(owner, repo, token)
    sensitive_files = _scan_file_tree(file_tree)
    secret_findings = _scan_file_contents(file_contents)

    bad  = sum(1 for c in commits if c["msg_quality"] == "bad")
    warn = sum(1 for c in commits if c["msg_quality"] == "warn")

    return {
        "commits":         commits,
        "sensitive_files": sensitive_files,
        "secret_findings": secret_findings,
        "stats": {
            "total":           len(commits),
            "bad_messages":    bad,
            "warn_messages":   warn,
            "secrets_found":   len(secret_findings),
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
        msg    = (commit.get("message") or "").strip()
        first  = msg.split("\n")[0].strip()
        body   = "\n".join(msg.split("\n")[1:]).strip()
        author = commit.get("author", {})
        out.append({
            "sha":         (c.get("sha") or "")[:7],
            "full_sha":    c.get("sha") or "",
            "message":     first,
            "body":        body,
            "author":      author.get("name") or (c.get("author") or {}).get("login") or "unknown",
            "date":        author.get("date") or "",
            "msg_quality": _classify(first),
            "url":         c.get("html_url") or "",
        })
    return out


def _classify(msg: str) -> str:
    if not msg or len(msg) < 3:
        return "bad"
    if _BAD_MSG_RE.match(msg):
        return "bad"
    if len(msg) < 12:
        return "warn"
    return "good"


def _scan_file_tree(file_tree: list) -> list:
    out = []
    for path in file_tree:
        if _SENSITIVE_FILE_RE.search(path):
            out.append({"path": path, "reason": "Sensitive filename tracked in git"})
    return out


def _scan_file_contents(file_contents: dict) -> list:
    out = []
    for path, content in file_contents.items():
        if _SKIP_PATH_RE.search(path):
            continue
        for pattern, label in _SECRET_PATTERNS:
            m = pattern.search(content)
            if m:
                line_no = content[: m.start()].count("\n") + 1
                sev = "critical" if any(k in label for k in ("Private key", "AWS", "Token", "OpenAI", "Groq")) else "high"
                out.append({
                    "path":     path,
                    "line":     line_no,
                    "type":     label,
                    "snippet":  m.group()[:80],
                    "severity": sev,
                })
    return out


def _empty() -> dict:
    return {
        "commits": [],
        "sensitive_files": [],
        "secret_findings": [],
        "stats": {"total": 0, "bad_messages": 0, "warn_messages": 0, "secrets_found": 0, "sensitive_files": 0},
    }
