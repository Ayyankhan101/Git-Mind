import asyncio
import os
import time

import structlog

from llm_cache import invoke_with_retry
from settings import get_llm

logger = structlog.get_logger(__name__)

INTERVAL_SEC = int(os.getenv("REPORTER_INTERVAL_SEC", "45"))

_llm = get_llm(temperature_key="reporter")

REPORTER_PROMPT = """You are a senior reporter at a major tech publication. A source has tipped you
off about a possible security incident at a company. You have partial information.

Draft a 3-sentence breaking-news story using only the signals provided. Use
cautious language ('appears to', 'sources say') where facts are uncertain. Do
not invent specifics. Make it feel real — quote a hypothetical security expert
if useful.

End with: "We have reached out to [Company] for comment.\""""


async def reporter_loop(state_ref: dict, ws_send) -> None:
    """
    Section 9.3 reporter loop. Runs in parallel with the crisis graph.
    Every INTERVAL_SEC, checks public_signals. If any non-Legal agent leaked
    something AND the team has not resolved the crisis, drafts and publishes
    a story. Sets reporter_published=True on completion.
    """
    while not state_ref.get("crisis_resolved") and not state_ref.get(
        "reporter_published"
    ):
        await asyncio.sleep(INTERVAL_SEC)

        if state_ref.get("crisis_resolved") or state_ref.get("reporter_published"):
            return

        signals = state_ref.get("public_signals", [])
        if not signals:
            await ws_send(
                {
                    "agent": "Reporter",
                    "kind": "tick",
                    "content": f"No new tips. Watching for {INTERVAL_SEC}s more.",
                    "ts": time.time(),
                }
            )
            continue

        signals_text = "\n".join(f"- {s}" for s in signals[-5:])
        prompt = f"{REPORTER_PROMPT}\n\nSIGNALS:\n{signals_text}"

        try:
            story = invoke_with_retry(_llm, prompt).content
        except Exception as exc:
            logger.error("reporter LLM failed: %s", exc)
            return

        await ws_send(
            {
                "agent": "Reporter",
                "kind": "leak",
                "content": story,
                "timestamp": time.time(),
            }
        )
        state_ref["reporter_published"] = True
        logger.info("reporter published — crisis lost")
        return
