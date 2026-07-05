"""Centralized LLM configuration.

Single source of truth for model name, temperature defaults, and factory.
All agents/routes import from here instead of hardcoding ChatGroq(model=...).
"""

import os

from langchain_groq import ChatGroq

# ── Model configuration ───────────────────────────────────────────────────────
LLM_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")

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


def get_llm(
    *,
    temperature_key: str = "analysis",
    json_mode: bool = False,
    temperature: float | None = None,
) -> ChatGroq:
    """Return a configured ChatGroq instance.

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
    llm = ChatGroq(model=LLM_MODEL, temperature=temp)
    if json_mode:
        llm = llm.bind(response_format={"type": "json_object"})
    return llm
