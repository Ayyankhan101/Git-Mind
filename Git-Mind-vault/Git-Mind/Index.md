---
tags:
  - architecture
  - home
aliases: [Home, Dashboard]
---

# Git-Mind

Intelligent code analysis & chat. React 19 SPA + FastAPI backend + Rust sidecar. RAG over git repos using ChromaDB + Groq (llama-3.3-70b).

## Quick Navigation

- [[Notes/Architecture|Architecture]] — system layers, data flow, design decisions
- [[Notes/Tech Stack|Tech Stack]] — React, FastAPI, ChromaDB, Rust
- [[Notes/Development|Development]] — setup, commands, Docker, testing

## Active Work

```dataview
TASK
FROM "Git-Mind/Tasks/Current"
WHERE !completed
SORT file.name ASC
```

## Recent Changes

```dataview
TABLE file.name AS "Version", file.cday AS "Created"
FROM "Git-Mind/Changelog"
SORT file.cday DESC
LIMIT 5
```

## Related

- [[Git-Mind Graph|Knowledge Graph]] — full codebase map from graphify analysis
