"""Program registry — the seam that makes the 7 DSPy programs swappable.

Agents declare their program once via ``define_program``, which registers a
factory that builds a *fresh* student, and get back ``load_program(name)`` —
the promoted program when one is active, else the student. Orchestration,
routes, and the frontend contract never see the difference.

Promotion artifacts live in ``backend/optimized/<agent>-<ts>/`` (dspy pickle
format: metadata.json + program.pkl — the format ``Module.save(path,
save_program=True)`` writes; a ``.json`` suffix would raise). ``active.json``
records the active artifact per agent and keeps a short rollback history.
Everything under ``optimized/`` is gitignored, and ``load_program`` degrades
to the student when nothing is active or an artifact fails to load.

Programs loaded from an artifact carry two extra attributes:
- ``_opt_version`` — sha-256 (truncated) of the artifact's program.pkl; folded
  into cache keys so a promoted program never hits stale pre-optimization
  cache entries (see ``llm_cache.run_dspy_cached``).
- ``_agent`` — the registry name; used to name the telemetry harvest log.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import structlog

from dspy_setup import dspy

logger = structlog.get_logger(__name__)

OPT_DIR = Path(__file__).resolve().parent.parent / "optimized"
ACTIVE_FILE = OPT_DIR / "active.json"

# Attribute names stamped onto programs by this module (llm_cache reads them).
VERSION_ATTR = "_opt_version"
AGENT_ATTR = "_agent"


@dataclass(frozen=True)
class ProgramSpec:
    """One agent's program declaration."""

    name: str
    factory: Callable[[], object]  # returns a fresh, unoptimized student
    output_field: str  # the signature's output field (e.g. "findings")
    input_fields: tuple[str, ...]  # the signature's input fields
    output_model: type | None = (
        None  # Pydantic model; None ⇒ plain-str output (architecture)
    )
    output_list: bool = False  # True when the output field is a list of models


_REGISTRY: dict[str, ProgramSpec] = {}


def define_program(
    name: str,
    signature,
    *,
    output_field: str,
    input_fields: tuple[str, ...],
    output_model: type | None = None,
    cot: bool = False,
) -> object:
    """Register a program and return the one to use at runtime.

    This is the one-line agent hook: `_predictor = dspy.Predict(Sig)` becomes
    `_predictor = define_program("security", SecurityTriage, ...)`. The factory
    closes over the *signature class*, so each ``build_program`` call returns a
    pristine student — MIPROv2 compile may mutate or replace it.
    """
    factory = (
        (lambda s=signature: dspy.ChainOfThought(s))
        if cot
        else (lambda s=signature: dspy.Predict(s))
    )
    register(
        name,
        factory=factory,
        output_field=output_field,
        input_fields=input_fields,
        output_model=output_model,
        output_list=_signature_output_is_list(signature, output_field),
    )
    return load_program(name)


def register(
    name: str,
    *,
    factory: Callable[[], object],
    output_field: str,
    input_fields: tuple[str, ...],
    output_model: type | None = None,
    output_list: bool = False,
) -> None:
    """Register (or re-register) a program under ``name``."""
    spec = ProgramSpec(
        name=name,
        factory=factory,
        output_field=output_field,
        input_fields=tuple(input_fields),
        output_model=output_model,
        output_list=output_list,
    )
    _REGISTRY[name] = spec
    logger.debug("registered program %s", name)


def _signature_output_is_list(signature, output_field: str) -> bool:
    """True when the signature's output field is annotated as a list."""
    try:
        fields = getattr(signature, "model_fields", None) or {}
        annotation = fields.get(output_field).annotation  # type: ignore[union-attr]
        return getattr(annotation, "__origin__", None) in (list, tuple, set)
    except Exception:
        return False


def get_spec(name: str) -> ProgramSpec:
    try:
        return _REGISTRY[name]
    except KeyError:
        raise KeyError(
            f"no program registered for {name!r} — is the agent module imported?"
        ) from None


def agent_names() -> list[str]:
    return sorted(_REGISTRY)


def build_program(name: str) -> object:
    """Fresh, unoptimized student. MIPROv2 compile must never touch the live one."""
    return get_spec(name).factory()


def load_program(name: str) -> object:
    """Promoted program if active and loadable, else a fresh student."""
    artifact = active_artifact(name)
    if artifact:
        try:
            program = dspy.load(str(artifact), allow_pickle=True)
            setattr(program, VERSION_ATTR, _artifact_version(artifact))
            setattr(program, AGENT_ATTR, name)
            logger.info("loaded promoted program %s from %s", name, artifact.name)
            return program
        except Exception as exc:
            logger.warning(
                "promoted program %s unloadable (%s) — falling back to student",
                name,
                exc,
            )
    program = build_program(name)
    setattr(program, AGENT_ATTR, name)
    return program


def _artifact_version(artifact: Path) -> str:
    try:
        return hashlib.sha256((artifact / "program.pkl").read_bytes()).hexdigest()[:12]
    except OSError:
        return artifact.name


# ── Promotion state (optimized/active.json) ──────────────────────────────────


def active_artifact(name: str) -> Path | None:
    """Path to the active promoted artifact for ``name``, or None."""
    data = _read_active()
    raw = data.get(name)
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_dir() else None


def promote(name: str, artifact: Path) -> Path:
    """Record ``artifact`` as the active program for ``name`` (keeps rollback)."""
    OPT_DIR.mkdir(parents=True, exist_ok=True)
    data = _read_active()
    prev = data.get(name)
    if prev:
        history = data.setdefault("_rollback", {}).setdefault(name, [])
        history.append(prev)
        data["_rollback"][name] = history[-3:]  # keep last 3 for rollback
    data[name] = str(artifact)
    _write_active(data)
    logger.info("promoted %s -> %s", name, artifact)
    return artifact


def rollback(name: str) -> Path | None:
    """Restore the previous active artifact for ``name``, if any."""
    data = _read_active()
    history = data.get("_rollback", {}).get(name) or []
    while history:
        prev = Path(history.pop())
        if prev.is_dir():
            data[name] = str(prev)
            data["_rollback"][name] = history
            _write_active(data)
            logger.info("rolled back %s -> %s", name, prev)
            return prev
    return None


def _read_active() -> dict:
    try:
        return json.loads(ACTIVE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_active(data: dict) -> None:
    ACTIVE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
