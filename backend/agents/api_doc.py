import structlog
from gitmind_core import scan_route_files
from pydantic import BaseModel

from dspy_setup import dspy
from llm_cache import run_dspy_cached
from optimization.registry import define_program
from settings import LLM_MODEL, get_dspy_lm

logger = structlog.get_logger(__name__)

_MAX_FILES = 10
_MAX_FILE_CHARS = 6_000
_CACHE_NAMESPACE = f"{LLM_MODEL}:api_doc:json"
_LM = get_dspy_lm(temperature=0)


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

    for fp, content in list(api_files.items())[:_MAX_FILES]:
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
            endpoints = []

        for item in endpoints:
            key = (item.get("method", "").upper(), item.get("route", ""))
            if key not in seen:
                seen.add(key)
                results.append(item)

    logger.info(
        "API doc agent: found %d unique endpoints across %d files",
        len(results),
        len(api_files),
    )
    return results
