---
title: "Agent Nodes - 9 Parallel Analysis Agents"
tags: [gitmind, agents, architecture]
---

# Agent Nodes

Git-Mind runs **9 AI agents in parallel** per analysis. Orchestrated by LangGraph.

## Orchestrator Nodes


## Agent Implementations

- `backend_agents_init` — __init__.py
- `backend_agents_api_doc` — api_doc.py
- `backend_agents_api_doc_run_api_doc_agent` — run_api_doc_agent()
- `backend_agents_architecture` — architecture.py
- `backend_agents_architecture_detect_primary_language` — _detect_primary_language()
- `backend_agents_architecture_run_architecture_agent` — run_architecture_agent()
- `backend_agents_architecture_build_prompt` — _build_prompt()
- `backend_agents_architecture_strip_fences` — _strip_fences()
- `backend_agents_architecture_sanitize_mermaid` — _sanitize_mermaid()
- `backend_agents_architecture_rationale_149` — Remove markdown code fences that the LLM sometimes adds.
- `backend_agents_architecture_rationale_162` — Fix common LLM mistakes that cause Mermaid v11 parse errors.
- `backend_agents_blame` — blame.py
- `backend_agents_blame_enrich_findings_with_blame` — enrich_findings_with_blame()
- `backend_agents_blame_rationale_8` — Attach git blame info to each finding. Never raises — blame is best-effort.
- `backend_agents_chat` — chat.py
- `backend_agents_chat_truncate_history` — _truncate_history()
- `backend_agents_chat_build_context` — _build_context()
- `backend_agents_chat_build_messages` — _build_messages()
- `backend_agents_chat_chunks_to_sources` — _chunks_to_sources()
- `backend_agents_chat_run_chat_agent` — run_chat_agent()

---
Part of [[Git-Mind Graph]]