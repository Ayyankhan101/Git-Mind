import re

import httpx
import structlog
from pydantic import BaseModel

from core.dspy_setup import dspy
from core.llm_cache import run_dspy_cached
from core.settings import LLM_MODEL, get_dspy_lm
from optimization.registry import define_program

logger = structlog.get_logger(__name__)

_MAX_DIFF_CHARS = 14_000
_CACHE_NAMESPACE = f"{LLM_MODEL}:pr_review"
_LM = get_dspy_lm(temperature_key="pr_review")

_VERDICT_LABELS = {
    "APPROVE": "✅ APPROVE",
    "REQUEST CHANGES": "⚠️ REQUEST CHANGES",
    "NEEDS DISCUSSION": "💬 NEEDS DISCUSSION",
}


class ReviewIssue(BaseModel):
    """Single review issue — rendered back into the markdown contract verbatim."""

    file: str
    line: int | None = None
    severity: str
    title: str
    explanation: str


class PRReviewOutput(BaseModel):
    """Structured PR review — rendered back into the exact markdown contract."""

    summary: str
    issues: list[ReviewIssue]
    verdict: str
    verdict_justification: str


class PRReviewSignature(dspy.Signature):
    """You are a senior engineer performing a thorough code review.

    Rules:
    - Be specific — cite real file paths and line numbers from the diff.
    - Do not invent issues. Do not pad. Only flag things that matter.
    - verdict: one of APPROVE, REQUEST CHANGES, NEEDS DISCUSSION.
    - issue severity: CRITICAL (security/data-loss), HIGH (bug/crash), MEDIUM (logic/perf), LOW (style/naming).
    - issues: empty list when there are no significant issues."""

    pr_context: str = dspy.InputField(desc="Repository, PR metadata, and the diff to review")
    review: PRReviewOutput = dspy.OutputField(desc="Structured PR review")


_predictor = define_program(
    "pr_review",
    PRReviewSignature,
    output_field="review",
    input_fields=("pr_context",),
    output_model=PRReviewOutput,
    cot=True,
)


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

    context = (
        f"Repository: {pr['owner']}/{pr['repo']}\n"
        f"PR #{pr['pr_num']}: {pr['title']}\n"
        f"Author: {pr['author']}  →  merging into {pr['base_branch']}\n"
        f"Stats: +{pr['additions']} -{pr['deletions']} across {pr['changed_files']} file(s)\n"
        f"Description: {pr['body'] or 'None provided'}\n"
        + ("\n⚠ Diff was truncated to first 14 000 chars.\n" if pr["diff_truncated"] else "")
        + f"\nDiff:\n{pr['diff']}"
    )

    try:
        review_data = run_dspy_cached(
            _predictor,
            _CACHE_NAMESPACE,
            lm=_LM,
            output_field="review",
            pr_context=context,
        )
    except Exception as exc:
        logger.error(
            "PR review LLM failed for %s/%s#%s: %s",
            pr["owner"],
            pr["repo"],
            pr["pr_num"],
            exc,
        )
        review_data = {
            "summary": "Automatic review could not be generated — please review the diff manually.",
            "issues": [],
            "verdict": "NEEDS DISCUSSION",
            "verdict_justification": "The automated review failed; human review required.",
        }

    review = _render_review(review_data)
    logger.info("PR review complete for %s/%s#%s", pr["owner"], pr["repo"], pr["pr_num"])

    return {
        "pr_url": pr_url,
        "repo": f"{pr['owner']}/{pr['repo']}",
        "pr_num": pr["pr_num"],
        "title": pr["title"],
        "author": pr["author"],
        "additions": pr["additions"],
        "deletions": pr["deletions"],
        "changed_files": pr["changed_files"],
        "review": review,
    }


def _render_review(r: dict) -> str:
    """Render the typed review back into the exact markdown contract the frontend parses."""
    lines = ["## Summary", (r.get("summary") or "").strip(), "", "## Issues"]

    issues = r.get("issues") or []
    if issues:
        for it in issues:
            file = (it.get("file") or "").strip()
            line = it.get("line")
            sev = (it.get("severity") or "LOW").strip().upper()
            title = (it.get("title") or "").strip()
            explanation = (it.get("explanation") or "").strip()
            loc = f"{file}:{line}" if line else file
            lines.append(f"{loc} — [{sev}] {title} — {explanation}")
    else:
        lines.append("No significant issues found.")

    verdict = (r.get("verdict") or "NEEDS DISCUSSION").strip().upper()
    justification = (r.get("verdict_justification") or "").strip()
    lines.append("")
    lines.append("## Verdict")
    lines.append(_VERDICT_LABELS.get(verdict, verdict))
    if justification:
        lines.append(justification)

    return "\n".join(lines)
