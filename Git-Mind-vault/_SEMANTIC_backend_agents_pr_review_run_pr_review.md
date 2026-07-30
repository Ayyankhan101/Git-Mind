---
title: "run_pr_review"
tags: [gitmind, semantic, backend]
semantic_id: backend_agents_pr_review_run_pr_review
layer: backend
community: ?
---

Source: [`backend/agents/pr_review.py`](/home/ayyan/project/Git-Mind/backend/agents/pr_review.py)

# run_pr_review

Layer: **backend**

## Connections

- [[_SEMANTIC_backend_agents_pr_review_fetch_pr_data|backend_agents_pr_review_fetch_pr_data]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_llm_cache_get_cached|backend_llm_cache_get_cached]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_llm_cache_invoke_with_retry|backend_llm_cache_invoke_with_retry]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_llm_cache_set_cached|backend_llm_cache_set_cached]] (calls, EXTRACTED)

---

Part of [[Git-Mind Graph]]
