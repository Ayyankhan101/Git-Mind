"""Centralized LLM configuration.

Single source of truth for model name, temperature defaults, and factory.
All agents/routes import from here instead of hardcoding ChatGroq(model=...).
"""

import os

from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq

# ── Model configuration ───────────────────────────────────────────────────────
# gpt-oss-120b is a Groq "production" model. The previous default,
# qwen/qwen3.6-27b, scores higher on raw intelligence but is a Groq
# "preview" model — Groq's own docs say preview models are "for evaluation
# purposes only" and not meant for production traffic. Given this app has
# already been burned three times (see LLM_MODEL_FALLBACK below) by a model
# getting pulled/deprecated/rate-limited out from under it, production-tier
# stability wins over the intelligence gap here.
LLM_MODEL = os.environ.get("LLM_MODEL", "openai/gpt-oss-120b")

# Same-provider fallback — Groq only, no second vendor/SDK/API key needed.
#
# What this covers: one specific model getting deprecated, rate-limited, or
# pulled out from under LLM_MODEL. That has now happened three times, most
# recently when llama-3.1-8b-instant stopped being callable by this account's
# API key (404 model_not_found; it is absent from the key's /v1/models listing
# even though Groq's public docs still list it as production).
#
# What this does NOT cover: a gpt-oss family-wide or Groq-platform outage. An
# earlier version of this comment claimed the fallback was a different model
# family on purpose. That is no longer achievable — the only non-gpt-oss text
# models this account can call are Groq "preview" models, which the LLM_MODEL
# comment above already rejects for production traffic. Better to state the
# real coverage than to claim protection this does not provide.
#
# Set to "" to disable (get_llm then returns a plain runnable, see below).
LLM_MODEL_FALLBACK = os.environ.get("LLM_MODEL_FALLBACK", "openai/gpt-oss-20b")

# Cheap tier — for high-volume, low-judgment tasks (structured extraction from
# already-deterministic input, not open-ended reasoning): agents/api_doc.py
# and agents/language_audit.py. Deliberately NOT used for anything
# security-critical or user-facing-quality-critical (chat, fix, PR review,
# security/Solidity triage, incident reports) — those stay on LLM_MODEL.
#
# Its own literal default, NOT `LLM_MODEL_FALLBACK`. These two happen to name
# the same model today, but chaining them meant retuning the fallback silently
# retuned which model every api_doc and language_audit call went to.
LLM_MODEL_CHEAP = os.environ.get("LLM_MODEL_CHEAP", "openai/gpt-oss-20b")

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
    llm: Runnable = ChatGroq(model=model, temperature=temp)
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
    cheap: bool = False,
):
    """Return a configured DSPy LM (Groq via LiteLLM), mirroring get_llm.

    Uses the same per-use-case temperature defaults as get_llm, exposed as a
    dspy.LM for use inside DSPy programs. DSPy's internal response cache is
    disabled — the Redis/diskcache LLM cache (llm_cache.py) wraps program
    calls instead.

    cheap:
        Use LLM_MODEL_CHEAP instead of LLM_MODEL — see its module comment
        for which tasks that's appropriate for.
    """
    from core.dspy_setup import dspy

    temp = temperature if temperature is not None else TEMPERATURES.get(temperature_key, 0.1)
    model = LLM_MODEL_CHEAP if cheap else LLM_MODEL
    return dspy.LM(model=f"groq/{model}", temperature=temp, cache=False)


def get_dspy_lm_pair(
    *,
    temperature_key: str = "analysis",
    temperature: float | None = None,
):
    """Return (cheap_lm, flagship_lm) at the same temperature.

    The cheap-tier agents pass both to `run_dspy_cached`, which retries on the
    flagship if the cheap model raises. Without this, a cheap model that stops
    being callable takes the agent down entirely — api_doc raising outright,
    language_audit silently returning no findings.

    Returns (cheap_lm, None) when both tiers name the same model, so the caller
    does not pay a pointless second attempt against the model that just failed.
    """
    cheap_lm = get_dspy_lm(temperature_key=temperature_key, temperature=temperature, cheap=True)
    if LLM_MODEL_CHEAP == LLM_MODEL:
        return cheap_lm, None
    flagship_lm = get_dspy_lm(temperature_key=temperature_key, temperature=temperature, cheap=False)
    return cheap_lm, flagship_lm
