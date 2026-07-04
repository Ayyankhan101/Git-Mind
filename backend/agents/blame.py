import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def enrich_findings_with_blame(findings: list[dict], local_path: str) -> list[dict]:
    """Attach git blame info to each finding. Never raises — blame is best-effort."""
    # Collect valid (file, line) pairs for batch processing
    blame_inputs: list[tuple[str, int]] = []
    valid_indices: list[int] = []

    for i, f in enumerate(findings):
        rel_file = f.get("file", "")
        line = f.get("line_start")
        if not rel_file or not line:
            continue
        p = Path(rel_file)
        if p.is_absolute() or ".." in p.parts:
            continue
        if not (Path(local_path) / rel_file).exists():
            continue
        blame_inputs.append((rel_file, int(line)))
        valid_indices.append(i)

    # Single batch blame call
    blame_results: list[dict] = []
    if blame_inputs:
        try:
            from gitmind_core import batch_blame

            raw = batch_blame(blame_inputs, local_path)
            blame_results = [
                dict(r) if r else {}
                for r in raw  # type: ignore[arg-type]
            ]
        except Exception as exc:
            logger.debug("batch blame failed — %s", exc)
            blame_results = [{} for _ in blame_inputs]

    # Map results back
    blame_map = dict(zip(valid_indices, blame_results, strict=True))
    return [{**f, "blame": blame_map[i] if blame_map.get(i) else None} for i, f in enumerate(findings)]
