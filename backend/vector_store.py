"""Vector store backend selector.

Defaults to the embedded ChromaDB client (today's behavior, zero risk to
existing deployments). Set QDRANT_URL to switch every caller to the Qdrant
sidecar instead — required once more than one backend worker/replica is
running, since ChromaDB's PersistentClient is file-locked and single-process.

Callers import from here instead of chroma_utils/qdrant_utils directly, so
the backend can be swapped in one place.
"""

import os

if os.getenv("QDRANT_URL"):
    from qdrant_utils import (  # noqa: F401
        collection_exists,
        delete_collection,
        embed_codebase,
        prune_old_collections,
        search_codebase,
    )

    BACKEND = "qdrant"
else:
    from chroma_utils import (  # noqa: F401
        collection_exists,
        delete_collection,
        embed_codebase,
        prune_old_collections,
        search_codebase,
    )

    BACKEND = "chroma"
