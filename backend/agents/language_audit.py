import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import orjson
from langchain_groq import ChatGroq

from llm_cache import get_cached, invoke_with_retry, set_cached

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"
_LLM = ChatGroq(model=_MODEL, temperature=0.1).bind(response_format={"type": "json_object"})
_CACHE_NS = "llama-3.3-70b-versatile:lang_audit:json"
_MAX_FINDINGS = 40


@dataclass
class AuditorDef:
    extensions: frozenset[str]
    tool: tuple[str, ...] | None
    tool_name: str | None
    llm_prompt: str


_PYTHON_PROMPT = """\
You are a senior Python code reviewer. Below are file paths and source contents
from a Python project.

Analyze each file for:
- Security vulnerabilities (SQL injection, command injection, unsafe eval/exec, XXE, pickle deserialization)
- Logic errors (incorrect exception handling, race conditions with asyncio, mutable default args)
- Anti-patterns (global state, wildcard imports, overly broad except)
- Performance issues (O(n**2) loops, missing __slots__, sync I/O in async code)
- Convention violations (PEP 8 naming, missing type hints, unused imports/variables)

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "file"         — relative file path
  "line"         — integer line number (or null)
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the issue
  "remediation"  — one concrete fix sentence
  "rule"         — pylint rule ID if applicable (e.g. "W0611"), or null
  "cwe"          — CWE identifier if applicable, or null

If no issues found, return {"findings": []}.
"""

_JS_TS_PROMPT = """\
You are a senior JavaScript/TypeScript code reviewer. Below are file paths and
source contents from a JS/TS project.

Analyze each file for:
- Security vulnerabilities (XSS, prototype pollution, unsafe regex, RCE via eval)
- Logic errors (async/await mistakes, null/undefined access, incorrect closure scoping)
- Anti-patterns (any abuse, deeply nested callbacks, mutation of function params)
- Performance issues (unnecessary re-renders, large deps arrays, O(n**2) in hot paths)
- Convention violations (unused vars, missing error handling, inconsistent naming)

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "file"         — relative file path
  "line"         — integer line number (or null)
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the issue
  "remediation"  — one concrete fix sentence
  "rule"         — eslint rule ID if applicable (e.g. "no-unused-vars"), or null
  "cwe"          — CWE identifier if applicable, or null

If no issues found, return {"findings": []}.
"""

_GO_PROMPT = """\
You are a senior Go code reviewer. Below are file paths and source contents
from a Go project.

Analyze each file for:
- Security vulnerabilities (SQL injection via string building, command injection, unsafe pointer misuse)
- Logic errors (deferred execution pitfalls, goroutine leaks, incorrect channel use)
- Anti-patterns (global mutex, naked returns, package-level state)
- Performance issues (goroutine leaks, excessive allocations, missing pool reuse)
- Convention violations (missing err checks, inconsistent naming, missing doc comments)

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "file"         — relative file path
  "line"         — integer line number (or null)
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the issue
  "remediation"  — one concrete fix sentence
  "rule"         — govet/vet rule ID if applicable, or null
  "cwe"          — CWE identifier if applicable, or null

If no issues found, return {"findings": []}.
"""

_RUST_PROMPT = """\
You are a senior Rust code reviewer. Below are file paths and source contents
from a Rust project.

Analyze each file for:
- Security vulnerabilities (unsafe block misuse, transmute, buffer overflow)
- Logic errors (incorrect borrows, lifetime mismatches, panic unwinds)
- Anti-patterns (unnecessary clones, large enum overhead, Box<dyn> everywhere)
- Performance issues (O(n**2) with Vec, unnecessary allocations, Arc misuse)
- Convention violations (missing derives, unwrap/expect in production, TODO stubs)

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "file"         — relative file path
  "line"         — integer line number (or null)
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the issue
  "remediation"  — one concrete fix sentence
  "rule"         — clippy lint name if applicable (e.g. "clippy::unwrap_used"), or null
  "cwe"          — CWE identifier if applicable, or null

If no issues found, return {"findings": []}.
"""

_JAVA_PROMPT = """\
You are a senior Java code reviewer. Below are file paths and source contents
from a Java project.

Analyze each file for:
- Security vulnerabilities (SQL injection, XXE, insecure deserialization, path traversal)
- Logic errors (null pointer, incorrect equals/hashCode, thread safety issues)
- Anti-patterns (god class, empty catch blocks, magic numbers, excessive null checks)
- Performance issues (O(n**2) in loops, missing StringBuilder, excessive boxing)
- Convention violations (unused imports, missing Override, naming conventions)

Return a JSON object with key "findings" containing an array.
Each item must have:
  "id"           — short unique id
  "file"         — relative file path
  "line"         — integer line number (or null)
  "severity"     — critical / high / medium / low
  "title"        — short title (max 10 words)
  "description"  — one sentence explaining the issue
  "remediation"  — one concrete fix sentence
  "rule"         — null (Java uses LLM-only fallback)
  "cwe"          — CWE identifier if applicable, or null

If no issues found, return {"findings": []}.
"""

_LANGUAGE_MAP: dict[str, AuditorDef] = {
    "python": AuditorDef(
        extensions=frozenset({".py"}),
        tool=("pylint", "--output-format=json", "--recursive=y"),
        tool_name="pylint",
        llm_prompt=_PYTHON_PROMPT,
    ),
    "javascript": AuditorDef(
        extensions=frozenset({".js", ".mjs"}),
        tool=("eslint", "-f", "json"),
        tool_name="eslint",
        llm_prompt=_JS_TS_PROMPT,
    ),
    "typescript": AuditorDef(
        extensions=frozenset({".ts", ".tsx"}),
        tool=("eslint", "--ext", ".ts,.tsx", "-f", "json"),
        tool_name="eslint",
        llm_prompt=_JS_TS_PROMPT,
    ),
    "go": AuditorDef(
        extensions=frozenset({".go"}),
        tool=("go", "vet", "./..."),
        tool_name="go vet",
        llm_prompt=_GO_PROMPT,
    ),
    "rust": AuditorDef(
        extensions=frozenset({".rs"}),
        tool=("cargo", "clippy", "--message-format=json"),
        tool_name="clippy",
        llm_prompt=_RUST_PROMPT,
    ),
    "java": AuditorDef(
        extensions=frozenset({".java"}),
        tool=None,
        tool_name=None,
        llm_prompt=_JAVA_PROMPT,
    ),
}


def run_code_audit(file_tree: list[str], file_contents: dict[str, str]) -> list[dict]:
    results: list[dict] = []
    for lang, cfg in _LANGUAGE_MAP.items():
        matching = [f for f in file_tree if Path(f).suffix in cfg.extensions]
        if not matching:
            continue
        lang_result = _audit_language(lang, cfg, matching, file_contents)
        if lang_result and lang_result.get("findings"):
            results.append(lang_result)
    return results


def _audit_language(lang: str, cfg: AuditorDef, matching: list[str], file_contents: dict[str, str]) -> dict:
    file_count = len(matching)
    tool_name: str | None = cfg.tool_name

    if cfg.tool and shutil.which(cfg.tool[0]):
        tool_results = _run_tool(cfg.tool, matching, file_contents, lang)
        if tool_results:
            findings = _triage_with_llm(cfg.llm_prompt, tool_results, lang)
            if findings:
                return {
                    "language": lang,
                    "tool": tool_name,
                    "findings": findings,
                    "file_count": file_count,
                    "finding_count": len(findings),
                }

    findings = _run_llm_fallback(cfg.llm_prompt, matching, file_contents, lang)
    if not findings:
        return {
            "language": lang,
            "tool": None,
            "findings": [],
            "file_count": file_count,
            "finding_count": 0,
        }

    return {
        "language": lang,
        "tool": None,
        "findings": findings,
        "file_count": file_count,
        "finding_count": len(findings),
    }


_SUPPORT_FILES: dict[str, frozenset[str]] = {
    "python": frozenset({"pyproject.toml", "setup.cfg", "setup.py", ".pylintrc", "tox.ini"}),
    "javascript": frozenset({"package.json", ".eslintrc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js"}),
    "typescript": frozenset(
        {"package.json", ".eslintrc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "tsconfig.json"}
    ),
    "go": frozenset({"go.mod", "go.sum"}),
    "rust": frozenset({"Cargo.toml", "Cargo.lock"}),
}


def _materialize_workspace(lang: str, matching: list[str], file_contents: dict[str, str]) -> str:
    dest = tempfile.mkdtemp(prefix="gitmind_audit_")
    paths_to_write: set[str] = set(matching)
    support_names = _SUPPORT_FILES.get(lang, frozenset())

    for path in file_contents:
        name = Path(path).name
        if name in support_names or path in support_names:
            paths_to_write.add(path)

    if lang == "go":
        paths_to_write.update(p for p in file_contents if p.endswith(".go"))
    elif lang == "rust":
        paths_to_write.update(p for p in file_contents if p.endswith(".rs"))

    for rel in paths_to_write:
        content = file_contents.get(rel)
        if content is None:
            continue
        out = Path(dest) / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8", errors="ignore")

    return dest


def _run_tool(tool: tuple[str, ...], matching: list[str], file_contents: dict[str, str], lang: str) -> list[dict]:
    dest = _materialize_workspace(lang, matching, file_contents)
    try:
        if lang in ("go", "rust"):
            proc = subprocess.run(
                [*tool],
                capture_output=True,
                text=True,
                timeout=90,
                shell=False,
                cwd=dest,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
        else:
            rel_matching = [p for p in matching if p in file_contents]
            proc = subprocess.run(
                [*tool, *rel_matching],
                capture_output=True,
                text=True,
                timeout=90,
                shell=False,
                cwd=dest,
            )
        stdout = proc.stdout or ""
        if lang == "rust":
            raw = orjson.loads(stdout)
            return [r for r in raw if isinstance(r, dict) and "message" in r]
        if lang == "python":
            data = orjson.loads(stdout)
            return data if isinstance(data, list) else data.get("results", data)
        return orjson.loads(stdout)
    except Exception as exc:
        logger.warning("Tool audit failed for %s: %s", lang, exc)
        return []
    finally:
        shutil.rmtree(dest, ignore_errors=True)


def _triage_with_llm(prompt_template: str, tool_results: list[dict], lang: str) -> list[dict]:
    truncated = [
        {
            "file": r.get("path") or r.get("file") or "",
            "line": r.get("line") or (r.get("message", {}) or {}).get("line"),
            "message": r.get("message", {}).get("message", "")
            if isinstance(r.get("message"), dict)
            else (r.get("message") or ""),
            "rule": r.get("symbol") or r.get("ruleId") or r.get("check_id") or r.get("code"),
        }
        for r in tool_results[:_MAX_FINDINGS]
    ]

    prompt = f"{prompt_template}\n\nTool findings:\n{orjson.dumps(truncated, option=orjson.OPT_INDENT_2).decode()}"

    cached = get_cached(_CACHE_NS, prompt)
    if cached:
        return orjson.loads(cached).get("findings", [])

    try:
        raw = invoke_with_retry(_LLM, prompt).content
        findings = orjson.loads(raw).get("findings", [])
        set_cached(_CACHE_NS, prompt, raw)
    except Exception as exc:
        logger.error("LLM triage failed for %s: %s", lang, exc)
        return []

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])
    return findings[:_MAX_FINDINGS]


def _run_llm_fallback(
    prompt_template: str, matching: list[str], file_contents: dict[str, str], lang: str
) -> list[dict]:
    sources = {p: file_contents.get(p, "") for p in matching if file_contents.get(p, "")}
    if not sources:
        return []

    prompt = f"{prompt_template}\n\nFiles:\n{orjson.dumps(sources, option=orjson.OPT_INDENT_2).decode()}"

    cached = get_cached(_CACHE_NS, prompt)
    if cached:
        return orjson.loads(cached).get("findings", [])

    try:
        raw = invoke_with_retry(_LLM, prompt).content
        findings = orjson.loads(raw).get("findings", [])
        set_cached(_CACHE_NS, prompt, raw)
    except Exception as exc:
        logger.error("LLM fallback failed for %s: %s", lang, exc)
        return []

    for f in findings:
        f.setdefault("id", uuid.uuid4().hex[:8])
    return findings[:_MAX_FINDINGS]
