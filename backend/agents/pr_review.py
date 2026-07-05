import logging
import re

import httpx
import orjson

from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import get_llm

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"
_MAX_DIFF_CHARS = 14_000
_CACHE_NAMESPACE = "llama-3.3-70b-versatile:pr_review"
_LLM = get_llm(temperature_key="pr_review", json_mode=True)


def _parse_pr_url(pr_url: str) -> tuple[str, str, str]:
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)", pr_url.strip())
    if not m:
        raise ValueError("Not a valid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123")
    return m.group(1), m.group(2), m.group(3)


def _gh_headers(token: str | None = None) -> dict:
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def fetch_pr_data(pr_url: str, token: str | None = None) -> dict:
    owner, repo, pr_num = _parse_pr_url(pr_url)
    api_base = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_num}"
    headers = _gh_headers(token)

    with httpx.Client(timeout=15.0) as client:
        meta_resp = client.get(api_base, headers=headers)
        if meta_resp.status_code == 404:
            raise ValueError(f"PR not found: {owner}/{repo}#{pr_num} — check the URL and repo visibility")
        if meta_resp.status_code == 403:
            raise ValueError("GitHub rate limit hit — set GITHUB_TOKEN env var to raise limit")
        meta_resp.raise_for_status()
        meta = meta_resp.json()

        diff_resp = client.get(
            api_base,
            headers={**headers, "Accept": "application/vnd.github.v3.diff"},
        )
        diff = diff_resp.text[:_MAX_DIFF_CHARS]

    return {
        "owner": owner,
        "repo": repo,
        "pr_num": pr_num,
        "title": meta.get("title", ""),
        "body": (meta.get("body") or "")[:800],
        "author": meta.get("user", {}).get("login", "unknown"),
        "base_branch": meta.get("base", {}).get("ref", "main"),
        "head_sha": meta.get("head", {}).get("sha", ""),
        "changed_files": meta.get("changed_files", 0),
        "additions": meta.get("additions", 0),
        "deletions": meta.get("deletions", 0),
        "diff": diff,
        "diff_truncated": len(diff_resp.text) > _MAX_DIFF_CHARS,
    }


def run_pr_review(pr_url: str, token: str | None = None) -> dict:
    pr = fetch_pr_data(pr_url, token)

    prompt = (
        f"You are a senior engineer performing a thorough code review.\n\n"
        f"Repository: {pr['owner']}/{pr['repo']}\n"
        f"PR #{pr['pr_num']}: {pr['title']}\n"
        f"Author: {pr['author']}  →  merging into {pr['base_branch']}\n"
        f"Stats: +{pr['additions']} -{pr['deletions']} across {pr['changed_files']} file(s)\n"
        f"Description: {pr['body'] or 'None provided'}\n"
        + ("\n⚠ Diff was truncated to first 14 000 chars.\n" if pr["diff_truncated"] else "")
        + f"\nDiff:\n{pr['diff']}\n\n"
        "Return JSON with exactly these keys:\n"
        '- "summary": 2-3 sentences — what this PR does and your overall impression\n'
        '- "issues": list of objects, each with { "file": str, "line": int, '
        '"severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "title": str, '
        '"explanation": str, "suggestion": str }. If no issues, return empty list []\n'
        '- "verdict": exactly "APPROVE" | "REQUEST CHANGES" | "NEEDS DISCUSSION"\n'
        '- "verdict_justification": one sentence explaining the verdict\n'
        "Be specific — cite real file paths and line numbers from the diff. "
        "Do not invent issues. Only flag things that matter. No markdown. Only valid JSON."
    )

    cache_key = f"{pr['owner']}/{pr['repo']}#{pr['pr_num']}:{pr.get('head_sha', '')}"
    cached = get_cached(_CACHE_NAMESPACE, cache_key)
    if cached:
        logger.debug("PR review: cache hit for %s/%s#%s", pr["owner"], pr["repo"], pr["pr_num"])
        review_data = orjson.loads(cached) if isinstance(cached, (str, bytes)) else cached
    else:
        raw = invoke_with_retry(_LLM, prompt).content.strip()
        review_data = orjson.loads(raw)
        set_cached(_CACHE_NAMESPACE, cache_key, orjson.dumps(review_data).decode())
        logger.info("PR review complete for %s/%s#%s", pr["owner"], pr["repo"], pr["pr_num"])

    # Backward-compat markdown string
    issues_text = "\n".join(
        f"{i['file']}:{i.get('line', '?')} — [{i['severity']}] {i['title']} — {i['explanation']}"
        for i in review_data.get("issues", [])
    )
    review_md = (
        f"## Summary\n{review_data.get('summary', '')}\n\n"
        f"## Issues\n{issues_text or 'No significant issues found.'}\n\n"
        f"## Verdict\n{review_data.get('verdict', '')}\n"
        f"{review_data.get('verdict_justification', '')}"
    )

    return {
        "pr_url": pr_url,
        "repo": f"{pr['owner']}/{pr['repo']}",
        "pr_num": pr["pr_num"],
        "title": pr["title"],
        "author": pr["author"],
        "additions": pr["additions"],
        "deletions": pr["deletions"],
        "changed_files": pr["changed_files"],
        "review": review_md,
        "review_data": review_data,
    }
