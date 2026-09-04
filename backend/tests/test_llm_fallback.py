"""get_llm() wires a same-provider fallback model via LangChain's
with_fallbacks(), so a deprecated/rate-limited LLM_MODEL doesn't take every
agent down with it. No network calls here — just checking the Runnable is
actually wired up.
"""

import importlib

import settings


def test_fallback_wired_by_default():
    llm = settings.get_llm(temperature_key="chat")
    assert hasattr(llm, "fallbacks"), "expected a RunnableWithFallbacks — default LLM_MODEL_FALLBACK is set"
    assert len(llm.fallbacks) == 1


def test_fallback_uses_the_configured_model(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "primary-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "secondary-model")
    llm = settings.get_llm(temperature_key="chat")
    assert llm.runnable.model_name == "primary-model"
    assert llm.fallbacks[0].model_name == "secondary-model"


def test_no_fallback_wrapping_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "")
    llm = settings.get_llm(temperature_key="chat")
    assert not hasattr(llm, "fallbacks")


def test_no_fallback_wrapping_when_same_as_primary(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "same-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "same-model")
    llm = settings.get_llm(temperature_key="chat")
    assert not hasattr(llm, "fallbacks")


def test_json_mode_applies_to_both_primary_and_fallback(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "primary-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "secondary-model")
    llm = settings.get_llm(temperature_key="security", json_mode=True)
    # json_mode routes through ChatGroq.bind(...), which wraps in a RunnableBinding
    assert llm.runnable.kwargs.get("response_format") == {"type": "json_object"}
    assert llm.fallbacks[0].kwargs.get("response_format") == {"type": "json_object"}


def test_default_fallback_env_var_reads_module_default():
    importlib.reload(settings)
    assert settings.LLM_MODEL_FALLBACK == "llama-3.1-8b-instant"
    assert settings.LLM_MODEL_FALLBACK != settings.LLM_MODEL
