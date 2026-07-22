---
title: "Pipelines & Clusters (Hyperedges)"
tags: [gitmind, architecture, pipelines]
---

# Pipelines & Clusters

Hyperedges group nodes that participate in the same pipeline or pattern.


### LangGraph Parallel Analysis Pipeline
Relation: `participate_in`
- `backend_orchestrator_scanner_node`
- `backend_orchestrator_architecture_node`
- `backend_orchestrator_api_doc_node`
- `backend_orchestrator_security_node`
- `backend_orchestrator_rag_setup_node`
- `backend_orchestrator_cve_node`
- `backend_orchestrator_code_audit_node`
- `backend_orchestrator_sol_node`
- `backend_orchestrator_git_audit_node`

### LLM Agent Caching Pattern (ChatGroq + diskcache)
Relation: `implement`
- `backend_agents_api_doc_run_api_doc_agent`
- `backend_agents_architecture_run_architecture_agent`
- `backend_agents_security_run_security_agent`
- `backend_agents_language_audit_run_code_audit`
- `backend_agents_solidity_agent_solidity_agent`
- `backend_agents_impact_run_merge_prediction`
- `backend_agents_pr_review_run_pr_review`
- `backend_agents_crisis_base_make_crisis_agent`
- `backend_agents_crisis_reporter_reporter_loop`
- `backend_agents_chat_run_chat_agent`

### Crisis Role-Play Simulation (CEO/Legal/Engineer/Reporter)
Relation: `participate_in`
- `backend_agents_crisis_base`
- `backend_agents_crisis_reporter`
- `backend_agents_crisis_init`
- `backend_orchestrator`

### Session lifecycle management pattern
Relation: ``

### PDF report generation pipeline
Relation: ``

### Backend API auth and rate limiting pattern
Relation: ``

### Security Analysis Cluster
Relation: ``

### Chat/Interaction Cluster
Relation: ``

### Health & Monitoring Cluster
Relation: ``

### gitmind_core PyO3 module exports
Relation: `implements`

### Solidity analysis pipeline
Relation: `implements`

### Dependency file parser dispatch
Relation: `implements`

---
Part of [[Git-Mind Graph]]

## All Hyperedges (from graph.json)

### 9-Agent Parallel DAG Execution
Relation: `form` | Confidence: `EXTRACTED`
- `backend_orchestrator_build_graph`
- `backend_orchestrator_scanner_node`
- `backend_orchestrator_architecture_node`
- `backend_orchestrator_api_doc_node`
- `backend_orchestrator_security_node`
- `backend_orchestrator_rag_setup_node`
- `backend_orchestrator_cve_node`
- `backend_orchestrator_sol_node`
  *+2 more*

### RAG Search Pipeline (Vector + BM25 + RRF + Reranker)
Relation: `implement` | Confidence: `EXTRACTED`
- `backend_chroma_utils_embed_codebase`
- `backend_chroma_utils_search_codebase`
- `backend_chroma_utils_rrf_fuse`
- `concept_hybrid_search`
- `concept_language_aware_chunking`
- `concept_rag_pipeline`

### CI/CD Analysis Pipeline (Workflows + Backend + Deployment)
Relation: `participate_in` | Confidence: `INFERRED`
- `github_workflows_ci`
- `github_workflows_gitmind_analysis`
- `github_workflows_gitmind_monitor`
- `backend_smoke_test`
- `vercel_json`

### Crisis Simulation Multi-Agent System
Relation: `participate_in` | Confidence: `EXTRACTED`
- `backend_agents_crisis_base_py_make_crisis_agent`
- `backend_agents_crisis_ceo_py_ceo_node`
- `backend_agents_crisis_engineer_py_engineer_node`
- `backend_agents_crisis_legal_py_legal_node`
- `backend_agents_crisis_reporter_py_reporter_loop`
- `backend_agents_crisis_router_py_crisis_router`

### LLM Triage Pattern (tool + LLM fallback)
Relation: `implement` | Confidence: `INFERRED`
- `backend_agents_security_py_triage_with_llm`
- `backend_agents_solidity_agent_py_triage_with_llm`
- `backend_agents_language_audit_py_triage_with_llm`
- `backend_agents_api_doc_py_run_api_doc_agent`

### Health Scoring Pipeline
Relation: `participate_in` | Confidence: `INFERRED`
- `backend_agents_scanner_py_clone_and_scan`
- `backend_agents_security_py_run_security_agent`
- `backend_agents_cve_scanner_py_run_cve_scanner`
- `backend_agents_api_doc_py_run_api_doc_agent`
- `backend_agents_language_audit_py_run_code_audit`
- `backend_agents_health_py_compute_health`
- `backend_agents_impact_py_compute_impact`

### Session Management Cross-Cutting Concern
Relation: `` | Confidence: `INFERRED`
- `routes_analysis`
- `routes_analyze`
- `routes_chat`
- `routes_fix`
- `routes_incident`
- `routes_monitor`
- `routes_pr`

### Rate Limiting Cross-Cutting Concern
Relation: `` | Confidence: `INFERRED`
- `routes_analysis`
- `routes_analyze`
- `routes_chat`
- `routes_fix`
- `routes_github_webhook`
- `routes_incident`
- `routes_monitor`
- `routes_org`
  *+3 more*

### GitHub API Access Pattern
Relation: `` | Confidence: `INFERRED`
- `routes_github_webhook`
- `routes_org`
- `routes_pr`
- `routes_repos`
- `routes_fix`

### HTTP middleware stack — auth, body-limit, correlation, metrics
Relation: `conceptually_related_to` | Confidence: `INFERRED`
- `backend/services/auth.py:auth_middleware`
- `backend/services/body_limit.py:body_limit_middleware`
- `backend/services/correlation.py:correlation_middleware`
- `backend/services/telemetry.py:metrics_middleware`

### RAG retrieval pipeline — keyword index + cross-encoder reranking
Relation: `conceptually_related_to` | Confidence: `INFERRED`
- `backend/services/bm25_index.py:bm25_search`
- `backend/services/reranker.py:rerank`
- `backend/services/cache.py:get_redis`

### Session persistence — memory + Redis + database fallback
Relation: `conceptually_related_to` | Confidence: `INFERRED`
- `backend/services/session.py:put_session`
- `backend/services/session.py:get_session`
- `backend/services/cache.py:get_redis`
- `backend/services/database.py:get_analysis_db`

### Analysis Pipeline: WebSocket to Graph to Persistence
Relation: `` | Confidence: `INFERRED`
- `backend_ws_analyze_handle_analyze`
- `orchestrator_graph`
- `services_session`
- `services_database`
- `agents_health`
- `services_sha_cache`

### Crisis Pipeline: WebSocket to Graph to Reporter
Relation: `` | Confidence: `INFERRED`
- `backend_ws_crisis_handle_crisis`
- `orchestrator_crisis_graph`
- `agents_crisis_reporter`
- `services_session`
- `services_rate_limiter`

### WebSocket Auth and Rate Limiting Pattern
Relation: `` | Confidence: `INFERRED`
- `backend_ws_analyze_handle_analyze`
- `backend_ws_crisis_handle_crisis`
- `services_rate_limiter`
- `services_auth`

### Vitest test harness
Relation: `` | Confidence: ``
- `frontend_src_setuptests.js`
- `frontend_src_app.test.jsx`
- `frontend_src_api.test.js`
- `frontend_src_constants.test.js`

### Frontend API + auth layer
Relation: `` | Confidence: ``
- `frontend_src_api.js`
- `frontend_src_tokenManager.js`
- `frontend_src_app.jsx`

### Build and deploy pipeline
Relation: `` | Confidence: ``
- `frontend_vite.config.js`
- `frontend_vercel.json`
- `frontend_package.json`

### Security Findings Display Pattern
Relation: `shares_data_with` | Confidence: `INFERRED`
- `frontend_src_components_securitytab.jsx`
- `frontend_src_components_cvectab.jsx`
- `frontend_src_components_codeaudittab.jsx`
- `frontend_src_components_soliditytab.jsx`
- `frontend_src_components_gitaudittab.jsx`

### Health Score Visualization
Relation: `conceptually_related_to` | Confidence: `INFERRED`
- `frontend_src_components_healthcard.jsx`
- `frontend_src_components_trendchart.jsx`
- `frontend_src_components_summarytab.jsx`

### AI Chat Interface Pattern
Relation: `conceptually_related_to` | Confidence: `INFERRED`
- `frontend_src_components_chattab.jsx`
- `frontend_src_components_nodepanel.jsx`

### gitmind-core PyO3 Rust module system
Relation: `` | Confidence: `INFERRED`
- `rust_gitmind_src_lib_rs`
- `rust_gitmind_src_blame_rs`
- `rust_gitmind_src_dep_parsers_rs`
- `rust_gitmind_src_file_scanner_rs`
- `rust_gitmind_src_text_splitter_rs`

### rust-sidecar Solidity parsing service
Relation: `` | Confidence: `INFERRED`
- `rust_sidecar_src_main_rs`
- `rust_sidecar_src_parser_rs`
- `rust_sidecar_src_models_rs`

