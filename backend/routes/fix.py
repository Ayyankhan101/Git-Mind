import asyncio
import contextlib
import os
import re
import shlex
import shutil
import stat
import subprocess
import tempfile
import uuid

import httpx as _httpx
import structlog
from fastapi import APIRouter, Request
from langchain_groq import ChatGroq

from agents.scanner import _GITHUB_URL_RE
from chroma_utils import search_codebase
from llm_cache import invoke_with_retry
from models.requests import AutoPRRequest, FixRequest
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit
from services.session import _UUID_RE, get_session

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/fix")
async def fix_endpoint(req: FixRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("fix", client_ip))[0]:
        return await rate_limit_response("fix", client_ip)

    session = await get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    finding = req.finding
    collection = session.get("chroma_collection_name")
    query = " ".join(
        filter(
            None,
            [
                finding.rule,
                finding.file,
                finding.title,
                (finding.description or "")[:100],
            ],
        )
    )

    chunks = await asyncio.to_thread(search_codebase, collection, query, 4) if collection else []
    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks) or "No code context available."

    prompt = (
        f"Repo: {session['repo_name']}\n\n"
        f"Security finding:\n"
        f"  Rule: {finding.rule or 'unknown'}\n"
        f"  Severity: {finding.severity or 'unknown'}\n"
        f"  Title: {finding.title or ''}\n"
        f"  Description: {finding.description or finding.exploit_story or ''}\n"
        f"  File: {finding.file or 'unknown'}  Line: {finding.line_start or '?'}\n\n"
        f"Relevant code:\n{context}\n\n"
        "Generate a fix for this vulnerability.\n"
        "Format your response as:\n\n"
        "**Fix explanation** (1 sentence)\n\n"
        "```diff\n"
        "--- a/path/to/file\n"
        "+++ b/path/to/file\n"
        "@@ ... @@\n"
        " context line\n"
        "-removed line\n"
        "+added line\n"
        " context line\n"
        "```\n\n"
        "Be precise. Only change what's needed to fix the vulnerability."
    )

    def _generate() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
        return invoke_with_retry(llm, prompt).content.strip()

    fix = await asyncio.to_thread(_generate)
    logger.info("Fix generated", session=req.session_id, rule=finding.rule)
    return {"fix": fix, "finding_rule": finding.rule or "unknown"}


def _apply_and_push_pr(
    repo_url: str,
    patch: str,
    finding: dict,
    token: str,
) -> dict:
    branch = f"gitmind/fix-{finding.get('id', uuid.uuid4().hex[:6])}"
    dest = tempfile.mkdtemp(prefix="gitmind_pr_")
    _askpass_script = None

    try:
        # Use GIT_ASKPASS to avoid token in URLs/logs
        _env = {}
        if token:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as _askpass_script:
                _askpass_script.write(f"#!/bin/sh\nexec echo {shlex.quote(token)}\n")
                _askpass_name = _askpass_script.name
            os.chmod(_askpass_name, stat.S_IRUSR | stat.S_IXUSR)
            _env["GIT_ASKPASS"] = _askpass_name
        subprocess.run(
            ["git", "clone", "--depth=1", repo_url, dest],
            env={**os.environ, **_env},
            check=True,
            capture_output=True,
            timeout=60,
        )
        subprocess.run(
            ["git", "config", "user.email", "gitmind@example.com"],
            cwd=dest,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "GitMind Bot"],
            cwd=dest,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "checkout", "-b", branch],
            cwd=dest,
            check=True,
            capture_output=True,
        )

        # Reject patches that reference parent directories or absolute paths
        if ".." in patch or re.search(r"^---\s+/\S|^@@\s+.*@@.*\n---\s+/\S", patch, re.MULTILINE):
            raise ValueError("Patch content references parent directory or absolute path — rejected")
        proc = subprocess.run(
            ["patch", "-p1", "--forward", "--reject", f"--directory={dest}"],
            input=patch,
            text=True,
            cwd=dest,
            capture_output=True,
            timeout=15,
        )
        if proc.returncode not in (0, 1):
            raise RuntimeError("patch command failed")

        subprocess.run(["git", "add", "-A"], cwd=dest, check=True, capture_output=True)
        # Sanitize commit message: strip control chars and newlines
        safe_title = re.sub(r"[\x00-\x1f\x7f]", "", finding.get("title", "security fix"))[:72]
        safe_rule = re.sub(r"[\x00-\x1f\x7f]", "", finding.get("rule", "gitmind"))[:40]
        msg = f"fix: {safe_title} [{safe_rule}]"
        subprocess.run(["git", "commit", "-m", msg], cwd=dest, check=True, capture_output=True)
        subprocess.run(["git", "push", "origin", branch], cwd=dest, check=True, capture_output=True, timeout=30)
    finally:
        shutil.rmtree(dest, ignore_errors=True)
        if _askpass_script:
            with contextlib.suppress(OSError):
                os.unlink(_askpass_name)

    m = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
    if not m:
        raise ValueError("Could not parse GitHub owner/repo from URL")
    owner, repo = m.group(1), m.group(2)

    pr_body = (
        f"## Security Fix — {finding.get('title', 'Vulnerability')}\n\n"
        f"**Severity:** {finding.get('severity', 'unknown').upper()}\n"
        f"**File:** `{finding.get('file', '?')}` line {finding.get('line_start', '?')}\n\n"
        f"**Issue:** {finding.get('exploit_story') or finding.get('description', '')}\n\n"
        f"_Auto-generated by [GitMind](https://github.com) — AI-powered security remediation._"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitMind",
    }
    pr_data = {
        "title": f"fix: {finding.get('title', 'security vulnerability')}",
        "body": pr_body,
        "head": branch,
        "base": "main",
    }
    resp = _httpx.post(
        f"https://api.github.com/repos/{owner}/{repo}/pulls",
        headers=headers,
        json=pr_data,
        timeout=15.0,
    )
    if resp.status_code == 422:
        pr_data["base"] = "master"
        resp = _httpx.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            json=pr_data,
            timeout=15.0,
        )
    resp.raise_for_status()
    pr = resp.json()
    return {"pr_url": pr["html_url"], "pr_number": pr["number"], "branch": branch}


@router.post("/fix/pr")
async def auto_pr_endpoint(req: AutoPRRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("fix", client_ip))[0]:
        return await rate_limit_response("fix", client_ip)

    from services.auth import require_gh_token

    token = require_gh_token(request)

    session = await get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}

    repo_url = session.get("repo_url", "")
    if not _GITHUB_URL_RE.match(repo_url):
        return {"error": "Auto-PR requires a valid GitHub repo URL (https://github.com/owner/repo)"}

    finding = req.finding
    collection = session.get("chroma_collection_name")
    query = " ".join(
        filter(
            None,
            [
                finding.rule,
                finding.file,
                finding.title,
                (finding.description or "")[:100],
            ],
        )
    )
    chunks = await asyncio.to_thread(search_codebase, collection, query, 4) if collection else []
    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks) or "No context."

    prompt = (
        f"Security finding in {session['repo_name']}:\n"
        f"  Rule: {finding.rule or 'unknown'}  Severity: {finding.severity or 'unknown'}\n"
        f"  File: {finding.file or '?'}  Line: {finding.line_start or '?'}\n"
        f"  Issue: {finding.description or finding.exploit_story or ''}\n\n"
        f"Relevant code:\n{context}\n\n"
        "Output ONLY a unified diff in this exact format — no explanation, no markdown fences:\n"
        "--- a/path/to/file\n+++ b/path/to/file\n@@ ... @@\n context\n-removed\n+added\n"
    )

    def _gen_patch() -> str:
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)
        return invoke_with_retry(llm, prompt).content.strip()

    raw_patch = await asyncio.to_thread(_gen_patch)

    try:
        result = await asyncio.to_thread(_apply_and_push_pr, repo_url, raw_patch, finding.model_dump(), token)
        logger.info("Auto-PR created", pr_url=result.get("pr_url"))
        return result
    except Exception as exc:
        logger.error("Auto-PR failed", error=str(exc))
        return {"error": "Auto-PR failed — check token permissions and repo access"}
