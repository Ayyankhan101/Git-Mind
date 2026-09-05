import structlog
from gitmind_core import scan_route_files
from pydantic import BaseModel

from dspy_setup import dspy
from llm_cache import run_dspy_cached
from optimization.registry import define_program
from settings import LLM_MODEL_CHEAP, get_dspy_lm

logger = structlog.get_logger(__name__)

_MAX_FILES = 10
_MAX_FILE_CHARS = 6_000
# Cheap tier — extracting endpoints from source is pattern-matching, not
# judgment; see settings.py's LLM_MODEL_CHEAP comment.
_CACHE_NAMESPACE = f"{LLM_MODEL_CHEAP}:api_doc:json"
_LM = get_dspy_lm(temperature=0, cheap=True)


class ApiEndpoint(BaseModel):
    """Extracted HTTP endpoint — shape matches the frontend contract exactly."""

    method: str
    route: str
    description: str
    parameters: str
    auth_required: bool | None = None


class ApiDocSignature(dspy.Signature):
    """You are a senior API documentation engineer.

    Extract every HTTP API endpoint clearly defined in the code below. Be precise:
    only include endpoints that are clearly defined in this file. If no endpoints
    are found, return an empty list."""

    source_code: str = dspy.InputField(desc="File path and source code of one API route file")
    endpoints: list[ApiEndpoint] = dspy.OutputField(
        desc=(
            "Extracted endpoints. Each has: method (uppercase HTTP verb: GET, POST, PUT, DELETE, PATCH), "
            "route (URL path string e.g. '/api/users/:id'), description (one clear sentence on what it does "
            "and returns), parameters (comma-separated list of path/query params with types, or 'none'), "
            "auth_required (true/false, or null if unclear)."
        )
    )


_predictor = define_program(
    "api_doc",
    ApiDocSignature,
    output_field="endpoints",
    input_fields=("source_code",),
    output_model=ApiEndpoint,
)


def run_api_doc_agent(file_contents: dict[str, str]) -> list[dict]:
    api_files = {fp: content for fp, content in file_contents.items() if fp in scan_route_files(file_contents)}

    if not api_files:
        logger.info("API doc agent: no route patterns detected")
        return []

    results: list[dict] = []
    seen: set[tuple[str, str]] = set()  # dedup on (METHOD, route)
    files_attempted = list(api_files.items())[:_MAX_FILES]
    failures = 0

    for fp, content in files_attempted:
        try:
            endpoints = run_dspy_cached(
                _predictor,
                _CACHE_NAMESPACE,
                lm=_LM,
                output_field="endpoints",
                source_code=f"File: {fp}\n\n{content[:_MAX_FILE_CHARS]}",
            )
        except Exception as exc:
            logger.warning("API doc agent: parse failed for %s — %s", fp, exc)
            failures += 1
            endpoints = []

        for item in endpoints:
            key = (item.get("method", "").upper(), item.get("route", ""))
            if key not in seen:
                seen.add(key)
                results.append(item)

    if not results and failures and failures == len(files_attempted):
        # Route-like files exist (scan_route_files already filtered for
        # that), but every single extraction attempt crashed — an LLM
        # outage, not "this repo has no API". "No endpoints detected"
        # would be indistinguishable from a genuinely API-less repo.
        raise RuntimeError(f"API doc extraction failed on all {failures} candidate file(s)")

    logger.info(
        "API doc agent: found %d unique endpoints across %d files",
        len(results),
        len(api_files),
    )
    return results
