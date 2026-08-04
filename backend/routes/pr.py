import asyncio
import re
import shutil

import httpx
import structlog
from fastapi import APIRouter, Request

from agents.pr_review import run_pr_review
from models.requests import PRImpactRequest, PRReviewRequest
from routes._errors import error_response
from services.auth import get_gh_token
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip
from services.session import _UUID_RE, get_session

logger = structlog.get_logger(__name__)
router = APIRouter()

_PR_URL_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)/pull/(\d+)/?$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


@router.post("/pr-review")
async def pr_review_endpoint(req: PRReviewRequest, request: Request):
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("pr", f"{req.pr_url}:{client_ip}"))[0]:
        return await rate_limit_response("pr", f"{req.pr_url}:{client_ip}")
    token = get_gh_token(request)
    try:
        result = await asyncio.to_thread(run_pr_review, req.pr_url, token)
        return result
    except ValueError:
        return error_response("Invalid PR URL or insufficient GitHub permissions", 400)
    except Exception as exc:
        logger.error("PR review failed", error=str(exc))
        return error_response("PR review failed — check the URL and try again", 500)


@router.get("/pr-list/{owner}/{repo}")
async def list_open_prs(owner: str, repo: str, request: Request):
    if not _USERNAME_RE.match(owner) or not _USERNAME_RE.match(repo):
        return error_response("Invalid owner or repo name", 400)
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("pr", f"{owner}/{repo}:{client_ip}"))[0]:
        return await rate_limit_response("pr", f"{owner}/{repo}:{client_ip}")
    token = get_gh_token(request)
    gh_headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        gh_headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                params={"state": "open", "per_page": 20, "sort": "updated"},
                headers=gh_headers,
            )
        if resp.is_error:
            return error_response(f"GitHub API error {resp.status_code}", 502)
        prs = [
            {
                "number": pr["number"],
                "title": pr["title"],
                "url": pr["html_url"],
                "user": pr["user"]["login"],
                "updated_at": pr["updated_at"],
                "labels": [label["name"] for label in pr.get("labels", [])],
                "draft": pr.get("draft", False),
                "base_ref": pr["base"]["ref"],
                "head_ref": pr["head"]["ref"],
            }
            for pr in resp.json()
        ]
        return {"prs": prs}
    except Exception:
        return error_response("Failed to list PRs", 500)


@router.post("/pr-impact")
async def pr_impact_endpoint(req: PRImpactRequest, request: Request):
    m = _PR_URL_RE.match(req.pr_url.strip())
    if not m:
        return error_response("Invalid GitHub PR URL (expected https://github.com/owner/repo/pull/123)", 400)

    owner, repo_name, pr_num = m.group(1), m.group(2), m.group(3)
    repo_url = f"https://github.com/{owner}/{repo_name}"

    if not _UUID_RE.match(req.session_id):
        return error_response("Invalid session ID", 400)
    if not (await check_rate_limit("pr_impact", req.pr_url))[0]:
        return await rate_limit_response("pr_impact", req.pr_url)

    base_session = await get_session(req.session_id)
    if not base_session:
        return error_response("Session not found — analyze the base repo first", 404)

    token = get_gh_token(request)
    gh_headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        gh_headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            pr_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo_name}/pulls/{pr_num}",
                headers=gh_headers,
            )
    except Exception:
        return error_response("GitHub API error — check PR URL and try again", 502)

    if pr_resp.status_code == 404:
        return error_response(f"PR #{pr_num} not found — may be private or closed", 404)
    if pr_resp.is_error:
        return error_response(f"GitHub API error {pr_resp.status_code}", 502)

    pr_data = pr_resp.json()
    head_ref = pr_data.get("head", {}).get("ref")
    head_sha = pr_data.get("head", {}).get("sha", "")
    pr_title = pr_data.get("title", "")
    additions = pr_data.get("additions", 0)
    deletions = pr_data.get("deletions", 0)
    changed_files = pr_data.get("changed_files", 0)
    base_branch = pr_data.get("base", {}).get("ref", "main")

    if not head_ref:
        return error_response("Could not determine PR head branch from GitHub API", 502)

    pr_diff = ""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            diff_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo_name}/pulls/{pr_num}",
                headers={**gh_headers, "Accept": "application/vnd.github.v3.diff"},
            )
        if not diff_resp.is_error:
            pr_diff = diff_resp.text
    except Exception:
        pass

    from services.task_queue import submit

    pr_meta = {
        "title": pr_title,
        "owner": owner,
        "repo": repo_name,
        "pr_num": pr_num,
        "head_sha": head_sha,
        "base_branch": base_branch,
        "additions": additions,
        "deletions": deletions,
        "changed_files": changed_files,
        "diff_truncated": len(pr_diff) > 10_000,
    }
    task_id = submit(
        "compute_pr_impact",
        {
            "repo_url": repo_url,
            "token": token,
            "head_ref": head_ref,
            "base_session": base_session,
            "pr_meta": pr_meta,
            "pr_diff": pr_diff,
        },
    )
    logger.info("PR impact submitted", task_id=task_id, pr=req.pr_url)
    return {"task_id": task_id}


async def _compute_pr_impact(
    repo_url: str,
    token: str | None,
    head_ref: str,
    base_session: dict,
    pr_meta: dict,
    pr_diff: str,
) -> dict:
    from agents.cve_scanner import run_cve_scanner
    from agents.health import compute_health
    from agents.impact import compute_impact, run_merge_prediction
    from agents.language_audit import run_code_audit
    from agents.scanner import clone_and_scan
    from agents.security import run_security_agent

    local_path = None
    try:
        scan = await asyncio.to_thread(clone_and_scan, repo_url, token, head_ref)
        local_path = scan["local_path"]

        sec_findings = await asyncio.to_thread(run_security_agent, local_path)
        cve_findings = await asyncio.to_thread(run_cve_scanner, scan["file_contents"])
        code_audit = await asyncio.to_thread(
            run_code_audit,
            scan["file_tree"],
            scan["file_contents"],
        )
        pr_health = compute_health(
            file_contents=scan["file_contents"],
            security_findings=sec_findings,
            cve_findings=cve_findings,
            api_docs=base_session.get("api_docs", []),
            code_audit=code_audit,
        )

        pr_snapshot = {
            "health": pr_health,
            "security_findings": sec_findings,
            "cve_findings": cve_findings,
            "code_audit": code_audit,
        }
        base_snapshot = {
            "health": base_session.get("health"),
            "security_findings": base_session.get("security_findings", []),
            "cve_findings": base_session.get("cve_findings", []),
            "code_audit": base_session.get("code_audit"),
        }

        delta = compute_impact(base_snapshot, pr_snapshot)
        prediction = await asyncio.to_thread(run_merge_prediction, pr_diff, delta, pr_meta)

        logger.info(
            "PR impact computed: pr=%s delta=%+d risk=%s",
            repo_url,
            delta["health_delta"],
            prediction.get("merge_risk", "?"),
        )
        return {
            **delta,
            **prediction,
            "pr_title": pr_meta["title"],
            "head_ref": head_ref,
            "head_sha": pr_meta["head_sha"][:8],
            "additions": pr_meta["additions"],
            "deletions": pr_meta["deletions"],
            "changed_files": pr_meta["changed_files"],
        }
    except Exception as exc:
        logger.error("PR impact computation failed", error=str(exc))
        raise
    finally:
        if local_path:
            shutil.rmtree(local_path, ignore_errors=True)
