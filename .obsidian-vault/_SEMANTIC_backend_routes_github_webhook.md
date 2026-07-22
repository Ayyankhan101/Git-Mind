---
title: "POST /github/webhook receiver"
tags: [gitmind, semantic, backend]
semantic_id: backend_routes_github_webhook
layer: backend
community: ?
---

Source: [`backend/routes/github_webhook.py`](/home/ayyan/project/Git-Mind/backend/routes/github_webhook.py)

# POST /github/webhook receiver

Layer: **backend**

## Connections

- [[_SEMANTIC_backend_routes_verify_hmac|backend_routes_verify_hmac]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_routes_webhook_handle_pr|backend_routes_webhook_handle_pr]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_routes_webhook_handle_push|backend_routes_webhook_handle_push]] (calls, EXTRACTED)
- [[_SEMANTIC_backend_routes_webhook_handle_installation|backend_routes_webhook_handle_installation]] (calls, EXTRACTED)

---
Part of [[Git-Mind Graph]]