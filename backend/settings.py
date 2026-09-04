"""Centralized LLM configuration.

Single source of truth for model name, temperature defaults, and factory.
All agents/routes import from here instead of hardcoding ChatGroq(model=...).
"""

import os

from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq

# ── Model configuration ───────────────────────────────────────────────────────
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen/qwen3.6-27b")

# Same-provider fallback — Groq only, no second vendor/SDK/API key needed.
# Doesn't cover a full Groq-platform outage, but does cover the more common
# case (this app has hit twice already, per git history): a specific model
# getting deprecated or rate-limited out from under LLM_MODEL. Set to ""
# to disable. Different model family from the default on purpose, so a
# qwen-specific issue doesn't also take out the fallback.
LLM_MODEL_FALLBACK = os.environ.get("LLM_MODEL_FALLBACK", "llama-3.1-8b-instant")

# Per-use-case temperature defaults
TEMPERATURES = {
    "analysis": 0.1,  # summary, architecture, api_doc
    "security": 0.1,  # semgrep triage, CVE scanning
    "chat": 0.2,  # interactive Q&A
    "pr_review": 0.1,  # code review
    "code_audit": 0.1,  # language-specific lint triage
    "fix": 0.1,  # patch generation
    "incident": 0.2,  # incident report
    "crisis": 0.7,  # crisis simulation (high creativity)
    "reporter": 0.5,  # crisis reporter
    "impact": 0.15,  # impact analysis
}


def _build_groq(model: str, temp: float, json_mode: bool) -> Runnable:
    llm = ChatGroq(model=model, temperature=temp)
    if json_mode:
        llm = llm.bind(response_format={"type": "json_object"})
    return llm


def get_llm(
    *,
    temperature_key: str = "analysis",
    json_mode: bool = False,
    temperature: float | None = None,
) -> Runnable:
    """Return a configured ChatGroq instance (as a Runnable — see LLM_MODEL_FALLBACK).

    Parameters
    ----------
    temperature_key:
        Key into TEMPERATURES dict (e.g. "security", "chat").
    json_mode:
        If True, bind response_format={"type": "json_object"}.
    temperature:
        Override temperature (ignores temperature_key).
    """
    temp = temperature if temperature is not None else TEMPERATURES.get(temperature_key, 0.1)
    llm = _build_groq(LLM_MODEL, temp, json_mode)
    if LLM_MODEL_FALLBACK and LLM_MODEL_FALLBACK != LLM_MODEL:
        fallback = _build_groq(LLM_MODEL_FALLBACK, temp, json_mode)
        llm = llm.with_fallbacks([fallback])
    return llm


def get_dspy_lm(
    *,
    temperature_key: str = "analysis",
    temperature: float | None = None,
):
    """Return a configured DSPy LM (Groq via LiteLLM), mirroring get_llm.

    Uses the same LLM_MODEL and per-use-case temperature defaults as get_llm,
    exposed as a dspy.LM for use inside DSPy programs. DSPy's internal response
    cache is disabled — the Redis/diskcache LLM cache (llm_cache.py) wraps
    program calls instead.
    """
    from dspy_setup import dspy

    temp = temperature if temperature is not None else TEMPERATURES.get(temperature_key, 0.1)
    return dspy.LM(model=f"groq/{LLM_MODEL}", temperature=temp, cache=False)
