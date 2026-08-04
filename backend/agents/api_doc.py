import json
import structlog

from gitmind_core import scan_route_files

from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import LLM_MODEL, get_llm

logger = structlog.get_logger(__name__)

_MAX_FILES = 10
_MAX_FILE_CHARS = 6_000
_CACHE_NAMESPACE = f"{LLM_MODEL}:api_doc:json"
_LLM = get_llm(temperature=0, json_mode=True)

_PROMPT = """\
You are a senior API documentation engineer. Extract every HTTP API endpoint from the code below.
Return a JSON object with a single key "endpoints" containing an array.
Each item must have exactly these keys:
  "method"        — HTTP verb in uppercase (GET, POST, PUT, DELETE, PATCH)
  "route"         — the URL path string (e.g. "/api/users/:id")
  "description"   — one clear sentence explaining what this endpoint does and what it returns
  "parameters"    — comma-separated list of path/query params with types, or "none"
  "auth_required" — true if authentication/authorization is required, false otherwise, null if unclear

Be precise: only include endpoints that are clearly defined in this file.
If no endpoints are found, return {"endpoints": []}.
Do NOT include any explanation outside the JSON object.\
"""


def run_api_doc_agent(file_contents: dict[str, str]) -> list[dict]:
    api_files = {fp: content for fp, content in file_contents.items() if fp in scan_route_files(file_contents)}

    if not api_files:
        logger.info("API doc agent: no route patterns detected")
        return []

    results: list[dict] = []
    seen: set[tuple[str, str]] = set()  # dedup on (METHOD, route)

    for fp, content in list(api_files.items())[:_MAX_FILES]:
        prompt = f"{_PROMPT}\n\nFile: {fp}\n\n{content[:_MAX_FILE_CHARS]}"

        cached = get_cached(_CACHE_NAMESPACE, prompt)
        if cached:
            endpoints = json.loads(cached).get("endpoints", [])
            logger.debug("API doc agent: cache hit for %s", fp)
        else:
            try:
                raw = invoke_with_retry(_LLM, prompt).content
                endpoints = json.loads(raw).get("endpoints", [])
                set_cached(_CACHE_NAMESPACE, prompt, raw)
            except (json.JSONDecodeError, Exception) as exc:
                logger.warning("API doc agent: parse failed for %s — %s", fp, exc)
                endpoints = []

        for item in endpoints:
            key = (item.get("method", "").upper(), item.get("route", ""))
            if key not in seen:
                seen.add(key)
                results.append(item)

    logger.info("API doc agent: found %d unique endpoints across %d files", len(results), len(api_files))
    return results
