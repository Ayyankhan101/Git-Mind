---
title: "Edge: shares_data_with"
tags: [gitmind, edge, shares_data_with]
relation_type: shares_data_with
edge_count: 18
---

# Edge: shares_data_with

**18 connections** of type `shares_data_with`

## Connections

- [[_SEMANTIC_backend_orchestrator|backend_orchestrator]] → [[_SEMANTIC_backend_models_db|backend_models_db]] (INFERRED)
- [[_SEMANTIC_backend_main|backend_main]] → [[_SEMANTIC_backend_orchestrator|backend_orchestrator]] (INFERRED)
- [[_SEMANTIC_backend_main|backend_main]] → [[_SEMANTIC_backend_chroma_utils|backend_chroma_utils]] (INFERRED)
- [[_SEMANTIC_backend_routes_analysis_py|backend_routes_analysis_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_backend_routes_chat_py|backend_routes_chat_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_backend_routes_fix_py|backend_routes_fix_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_backend_routes_incident_py|backend_routes_incident_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_backend_routes_pr_py|backend_routes_pr_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_backend_routes_pr_py|backend_routes_pr_py]] → [[_SEMANTIC_backend_services_task_queue_py|backend_services_task_queue_py]] (EXTRACTED)
- [[_SEMANTIC_backend_ws_analyze_py|backend_ws_analyze_py]] → [[_SEMANTIC_backend_services_session_py|backend_services_session_py]] (EXTRACTED)
- [[_SEMANTIC_frontend_src_components_summarytab|frontend_src_components_summarytab]] → [[_SEMANTIC_frontend_src_components_monitoringtab|frontend_src_components_monitoringtab]] (INFERRED)
- [[_SEMANTIC_rust_sidecar_src_parser_parse_solidity|rust-sidecar_src_parser_parse_solidity]] → [[_SEMANTIC_rust_sidecar_src_models_ParseResponse|rust-sidecar_src_models_ParseResponse]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_parser_extract_contract|rust-sidecar_src_parser_extract_contract]] → [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_models_ParseResponse|rust-sidecar_src_models_ParseResponse]] → [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] → [[_SEMANTIC_rust_sidecar_src_models_FunctionInfo|rust-sidecar_src_models_FunctionInfo]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] → [[_SEMANTIC_rust_sidecar_src_models_VariableInfo|rust-sidecar_src_models_VariableInfo]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] → [[_SEMANTIC_rust_sidecar_src_models_ModifierInfo|rust-sidecar_src_models_ModifierInfo]] (EXTRACTED)
- [[_SEMANTIC_rust_sidecar_src_models_ContractInfo|rust-sidecar_src_models_ContractInfo]] → [[_SEMANTIC_rust_sidecar_src_models_EventInfo|rust-sidecar_src_models_EventInfo]] (EXTRACTED)

---
Part of [[Git-Mind Graph]]