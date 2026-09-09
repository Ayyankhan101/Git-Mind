"""Import-order guard for dspy.

DSPy 3.x lazy-imports optional deps (including numpy) by dropping a
``dspy.utils.lazy_import._LazyModule`` proxy into ``sys.modules``. Once that
proxy exists, chromadb's ``from numpy.typing import NDArray`` submodule import
hits the proxy mid-initialization and numpy fails to load
(``TypeError: data type 'bool' not understood``).

Loading the real numpy *before* dspy keeps ``require("numpy")`` from creating
the proxy — it finds numpy already in ``sys.modules`` and returns it directly.

Every dspy import in this codebase must go through this module so the guard
runs first.
"""

# ruff: noqa: I001 — import order is load-bearing: numpy MUST precede dspy
import numpy  # noqa: F401  — MUST precede dspy (see module docstring)
import dspy  # noqa: F401

__all__ = ["dspy", "numpy"]
