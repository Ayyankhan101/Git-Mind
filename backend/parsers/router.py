import structlog

from parsers.fallback_parser import parse_fallback
from parsers.jsts_parser import parse_jsts
from parsers.python_parser import parse_python

logger = structlog.get_logger(__name__)

EXT_TO_PARSER = {
    ".py": parse_python,
    ".js": parse_jsts,
    ".jsx": parse_jsts,
    ".ts": parse_jsts,
    ".tsx": parse_jsts,
    ".mjs": parse_jsts,
    ".cjs": parse_jsts,
}


def parse_file(file_path: str, source: str) -> dict | None:
    ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    parser = EXT_TO_PARSER.get(ext, parse_fallback)
    try:
        return parser(file_path, source)
    except Exception:
        logger.warning("Parser failed for %s, using fallback", file_path, exc_info=True)
        return parse_fallback(file_path, source)


def parse_files(file_contents: dict[str, str]) -> dict[str, dict]:
    results = {}
    for path, source in file_contents.items():
        parsed = parse_file(path, source)
        if parsed:
            results[path] = parsed
    return results
