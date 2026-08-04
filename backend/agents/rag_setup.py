import hashlib
import structlog
import re
import time

from chroma_utils import embed_codebase

logger = structlog.get_logger(__name__)

_UNSAFE_CHARS = re.compile(r"[^a-zA-Z0-9_]")
_MAX_ATTEMPTS = 3
_RETRY_DELAY = 5  # seconds


def run_rag_setup(file_contents: dict[str, str], repo_name: str, repo_url: str = "") -> str:
    url_hash = hashlib.sha256(repo_url.encode()).hexdigest()[:8]
    collection_name = ("repo_" + _UNSAFE_CHARS.sub("_", repo_name) + "_" + url_hash)[:63]
    logger.info("RAG setup: embedding %d files into '%s'", len(file_contents), collection_name)

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            embed_codebase(file_contents, collection_name)
            return collection_name
        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_ATTEMPTS:
                logger.warning(
                    "RAG embed attempt %d/%d failed (%s) — retrying in %ds", attempt, _MAX_ATTEMPTS, exc, _RETRY_DELAY
                )
                time.sleep(_RETRY_DELAY)
            else:
                logger.error("RAG embed failed after %d attempts: %s", _MAX_ATTEMPTS, exc)

    raise last_exc  # type: ignore[misc]
