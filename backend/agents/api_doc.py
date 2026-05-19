import json
import logging
import re

from langchain_groq import ChatGroq

from llm_cache import get_cached, set_cached, invoke_with_retry

logger = logging.getLogger(__name__)

_MODEL           = "llama-3.1-8b-instant"
_MAX_FILES       = 5
_MAX_FILE_CHARS  = 3_000
_CACHE_NAMESPACE = "llama-3.1-8b-instant:json"

# Compiled once at module load — scanning 300 files per request benefits from this
_ROUTE_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in [
        r'@app\.(get|post|put|delete|patch)\s*\(',       # FastAPI / Flask
        r'@router\.(get|post|put|delete|patch)\s*\(',
        r'router\.(get|post|put|delete)\s*\(',            # Express
        r'app\.(get|post|put|delete)\s*\(',
        r'@(Get|Post|Put|Delete|Patch)\s*\(',             # NestJS decorators
    ]
]

_PROMPT = """\
Extract every API endpoint from the code below.
Return a JSON object with a single key "endpoints" containing an array.
Each item must have exactly these keys:
  "method"      — HTTP verb in uppercase (GET, POST, PUT, DELETE, PATCH)
  "route"       — the URL path string
  "description" — one sentence explaining what this endpoint does
  "parameters"  — comma-separated list of params, or "none"

If no endpoints are found, return {"endpoints": []}.
Do NOT include any explanation outside the JSON object.\
"""


def run_api_doc_agent(file_contents: dict[str, str]) -> list[dict]:
    api_files = {
        fp: content
        for fp, content in file_contents.items()
        if any(p.search(content) for p in _ROUTE_PATTERNS)
    }

    if not api_files:
        logger.info("API doc agent: no route patterns detected")
        return [{
            "method": "N/A",
            "route": "No routes detected",
            "description": "No standard routing patterns found in this codebase.",
            "parameters": "N/A",
        }]

    llm = ChatGroq(model=_MODEL, temperature=0).bind(
        response_format={"type": "json_object"}
    )

    results: list[dict]         = []
    seen:    set[tuple[str, str]] = set()   # dedup on (METHOD, route)

    for fp, content in list(api_files.items())[:_MAX_FILES]:
        prompt = f"{_PROMPT}\n\nFile: {fp}\n\n{content[:_MAX_FILE_CHARS]}"

        cached = get_cached(_CACHE_NAMESPACE, prompt)
        if cached:
            endpoints = json.loads(cached).get("endpoints", [])
            logger.debug("API doc agent: cache hit for %s", fp)
        else:
            try:
                raw       = invoke_with_retry(llm, prompt).content
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

    logger.info("API doc agent: found %d unique endpoints", len(results))
    return results
