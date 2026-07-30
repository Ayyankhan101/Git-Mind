---
title: "Edge: calls"
tags: [gitmind, edge, calls]
relation_type: calls
edge_count: 120
---

# Edge: calls

**120 connections** of type `calls`

## Connections

- [[_SEMANTIC_backend_orchestrator_architecture_node|backend_orchestrator_architecture_node]] → [[_SEMANTIC_backend_agents_architecture_run_architecture_agent|backend_agents_architecture_run_architecture_agent]] (EXTRACTED)
- [[_SEMANTIC_backend_orchestrator_api_doc_node|backend_orchestrator_api_doc_node]] → [[_SEMANTIC_backend_agents_api_doc_run_api_doc_agent|backend_agents_api_doc_run_api_doc_agent]] (EXTRACTED)
- [[_SEMANTIC_backend_orchestrator_security_node|backend_orchestrator_security_node]] → [[_SEMANTIC_backend_agents_security_run_security_agent|backend_agents_security_run_security_agent]] (EXTRACTED)
- [[_SEMANTIC_backend_orchestrator_security_node|backend_orchestrator_security_node]] → [[_SEMANTIC_backend_agents_security_synthetic_finding|backend_agents_security_synthetic_finding]] (EXTRACTED)
- [[_SEMANTIC_backend_orchestrator_code_audit_node|backend_orchestrator_code_audit_node]] → [[_SEMANTIC_backend_agents_language_audit_run_code_audit|backend_agents_language_audit_run_code_audit]] (EXTRACTED)
- [[_SEMANTIC_backend_orchestrator_sol_node|backend_orchestrator_sol_node]] → [[_SEMANTIC_backend_agents_solidity_agent_solidity_agent|backend_agents_solidity_agent_solidity_agent]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_chat_run_chat_agent|backend_agents_chat_run_chat_agent]] → [[_SEMANTIC_backend_chroma_utils_search_codebase|backend_chroma_utils_search_codebase]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_chat_run_chat_agent|backend_agents_chat_run_chat_agent]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_chat_run_chat_agent_stream|backend_agents_chat_run_chat_agent_stream]] → [[_SEMANTIC_backend_chroma_utils_search_codebase|backend_chroma_utils_search_codebase]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_chat_run_chat_agent_stream|backend_agents_chat_run_chat_agent_stream]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_main_lifespan|backend_main_lifespan]] → [[_SEMANTIC_backend_orchestrator_reset_circuit_breaker|backend_orchestrator_reset_circuit_breaker]] (EXTRACTED)
- [[_SEMANTIC_backend_main_lifespan|backend_main_lifespan]] → [[_SEMANTIC_backend_chroma_utils_prune_old_collections|backend_chroma_utils_prune_old_collections]] (EXTRACTED)
- [[_SEMANTIC_backend_main_periodic_prune_loop|backend_main_periodic_prune_loop]] → [[_SEMANTIC_backend_chroma_utils_prune_old_collections|backend_chroma_utils_prune_old_collections]] (EXTRACTED)
- [[_SEMANTIC_backend_main_health|backend_main_health]] → [[_SEMANTIC_backend_orchestrator_get_circuit_breaker_state|backend_orchestrator_get_circuit_breaker_state]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_api_doc_run_api_doc_agent|backend_agents_api_doc_run_api_doc_agent]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_api_doc_run_api_doc_agent|backend_agents_api_doc_run_api_doc_agent]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_api_doc_run_api_doc_agent|backend_agents_api_doc_run_api_doc_agent]] → [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_architecture_run_architecture_agent|backend_agents_architecture_run_architecture_agent]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_architecture_run_architecture_agent|backend_agents_architecture_run_architecture_agent]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_architecture_run_architecture_agent|backend_agents_architecture_run_architecture_agent]] → [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_security_run_security_agent|backend_agents_security_run_security_agent]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_security_run_security_agent|backend_agents_security_run_security_agent]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_security_run_security_agent|backend_agents_security_run_security_agent]] → [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_language_audit_run_code_audit|backend_agents_language_audit_run_code_audit]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_language_audit_run_code_audit|backend_agents_language_audit_run_code_audit]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_language_audit_run_code_audit|backend_agents_language_audit_run_code_audit]] → [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_solidity_agent_solidity_agent|backend_agents_solidity_agent_solidity_agent]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_solidity_agent_solidity_agent|backend_agents_solidity_agent_solidity_agent]] → [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_solidity_agent_solidity_agent|backend_agents_solidity_agent_solidity_agent]] → [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (EXTRACTED)
- [[_SEMANTIC_backend_agents_impact_run_merge_prediction|backend_agents_impact_run_merge_prediction]] → [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (EXTRACTED)
- _+90 more_

---

Part of [[Git-Mind Graph]]
