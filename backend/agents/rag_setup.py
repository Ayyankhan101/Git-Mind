import hashlib
import logging
import re

from chroma_utils import embed_codebase

logger = logging.getLogger(__name__)

# Normalize repo name to a safe ChromaDB collection name
_UNSAFE_CHARS = re.compile(r"[^a-zA-Z0-9_]")


def run_rag_setup(file_contents: dict[str, str], repo_name: str, repo_url: str = "") -> str:
    url_hash = hashlib.sha256(repo_url.encode()).hexdigest()[:8]
    collection_name = ("repo_" + _UNSAFE_CHARS.sub("_", repo_name) + "_" + url_hash)[:63]
    logger.info("RAG setup: embedding %d files into '%s'", len(file_contents), collection_name)
    embed_codebase(file_contents, collection_name)
    return collection_name
