# API Reference

**Analysis**

| Endpoint                 | Method | Description                       |
| ------------------------ | ------ | --------------------------------- |
| `/ws/analyze`            | WS     | Streams agent events              |
| `/analyze`               | POST   | Triggers full pipeline            |
| `/analysis/{session_id}` | GET    | Load saved analysis snapshot      |
| `/analysis/previous`     | GET    | Last analysis for a repo          |
| `/analysis/history`      | GET    | Health trend data over time       |
| `/summary`               | POST   | Generate executive summary        |
| `/chat`                  | POST   | Ask a question about the codebase |
| `/chat/stream`           | POST   | SSE streaming chat                |
| `/fix`                   | POST   | Generate a fix patch              |

**PR Review**

| Endpoint                  | Method | Description           |
| ------------------------- | ------ | --------------------- |
| `/fix/pr`                 | POST   | Auto-create GitHub PR |
| `/pr-review`              | POST   | Review a GitHub PR    |
| `/pr-impact`              | POST   | Predict PR merge risk |
| `/pr-list/{owner}/{repo}` | GET    | List open PRs         |
| `/task/{task_id}`         | GET    | Poll background task  |

**Monitoring & Org**

| Endpoint                | Method | Description                  |
| ----------------------- | ------ | ---------------------------- |
| `/repos/{username}`     | GET    | List user repos              |
| `/monitor/subscribe`    | POST   | Subscribe to repo monitoring |
| `/monitor/status`       | GET    | List monitored repos         |
| `/monitor/{monitor_id}` | DELETE | Unsubscribe from monitoring  |
| `/org-audit`            | POST   | Cross-repo CVE scan          |
| `/webhook/notify`       | POST   | Push results to webhook      |
| `/github/webhook`       | POST   | GitHub App webhook handler   |
| `/incident-report`      | POST   | Generate incident report     |

**System**

| Endpoint     | Method | Description           |
| ------------ | ------ | --------------------- |
| `/ws/crisis` | WS     | Crisis Mode role-play |
| `/health`    | GET    | Health check          |
| `/metrics`   | GET    | Prometheus metrics    |
