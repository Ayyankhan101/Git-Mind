import asyncio
import base64
import re

import httpx
import structlog
from fastapi import APIRouter, Request

from agents.cve_scanner import run_cve_scanner
from models.requests import OrgAuditRequest
from services.auth import get_gh_token
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip

logger = structlog.get_logger(__name__)
router = APIRouter()

_DEP_FILES = [
    "requirements.txt",
    "package-lock.json",
    "package.json",
    "Cargo.lock",
    "go.sum",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Pipfile.lock",
    "poetry.lock",
    "Gemfile.lock",
]
_REPO_URL_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+?)(?:\.git)?/?$")


@router.post("/org-audit")
async def org_audit_endpoint(req: OrgAuditRequest, request: Request):
    if not req.repos:
        return {"error": "repos list is empty"}
    if len(req.repos) > 20:
        return {"error": "Maximum 20 repos per org audit"}

    client_ip = get_client_ip(request)
    if not (await check_rate_limit("org_audit", client_ip))[0]:
        return await rate_limit_response("org_audit", client_ip)

    token = get_gh_token(request)
    gh_headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitMind"}
    if token:
        gh_headers["Authorization"] = f"Bearer {token}"

    async def _fetch_dep_files(owner: str, repo: str) -> dict[str, str]:
        contents: dict[str, str] = {}
        async with httpx.AsyncClient(timeout=10.0) as client:
            for dep_file in _DEP_FILES:
                try:
                    r = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/contents/{dep_file}",
                        headers=gh_headers,
                    )
                    if r.status_code == 200:
                        data = r.json()
                        if data.get("encoding") == "base64":
                            contents[dep_file] = base64.b64decode(data["content"]).decode(errors="ignore")
                except Exception:
                    pass
        return contents

    async def _scan_repo(repo_url: str) -> dict:
        m = _REPO_URL_RE.match(repo_url.strip())
        if not m:
            return {"repo_url": repo_url, "error": "Invalid GitHub URL", "cve_findings": [], "repo_name": repo_url}
        owner, repo = m.group(1), m.group(2)
        try:
            file_contents = await _fetch_dep_files(owner, repo)
            findings = await asyncio.to_thread(run_cve_scanner, file_contents)
            return {
                "repo_url": repo_url,
                "repo_name": repo,
                "cve_count": len(findings),
                "cve_findings": findings,
                "dep_files_found": list(file_contents.keys()),
                "error": None,
            }
        except Exception as exc:
            logger.error("CVE scan failed", repo=repo_url, error=str(exc))
            return {
                "repo_url": repo_url,
                "repo_name": repo_url.split("/")[-1],
                "error": "Scan failed",
                "cve_findings": [],
                "cve_count": 0,
            }

    results = await asyncio.gather(*[_scan_repo(url) for url in req.repos])

    cve_repo_map: dict[str, list[str]] = {}
    for r in results:
        for pkg in r.get("cve_findings", []):
            for v in pkg.get("vulns", []):
                vid = v.get("id", "")
                if vid:
                    cve_repo_map.setdefault(vid, []).append(r["repo_name"])

    shared_cves = [
        {"cve_id": vid, "repos": repos, "repo_count": len(repos)}
        for vid, repos in sorted(cve_repo_map.items(), key=lambda x: -len(x[1]))
        if len(repos) >= 2
    ]

    total_cves = sum(r.get("cve_count", 0) for r in results)
    repos_clean = sum(1 for r in results if r.get("cve_count", 0) == 0 and not r.get("error"))
    logger.info("Org audit complete", repos=len(req.repos), total_cves=total_cves, shared=len(shared_cves))

    return {
        "repos": list(results),
        "shared_cves": shared_cves,
        "stats": {
            "total_repos": len(req.repos),
            "total_cves": total_cves,
            "repos_clean": repos_clean,
            "shared_count": len(shared_cves),
        },
    }
