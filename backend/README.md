---
title: GitMind Backend
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# GitMind Backend

FastAPI + LangGraph backend for [GitMind](https://github.com/) — AI-powered
GitHub repo analysis (architecture diagrams, security/CVE scanning, RAG chat,
multi-agent crisis simulation).

This Space runs the backend only. The React frontend is deployed separately
(e.g. on Vercel) and points at this Space via `REACT_APP_API_BASE`.

## Required secrets

Set these in **Settings → Variables and secrets**:

| Name | Required | Notes |
|------|----------|-------|
| `GROQ_API_KEY` | ✅ | Groq API key (`gsk_...`) — the app won't start without it. |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins, e.g. your Vercel URL `https://your-app.vercel.app`. |
| `GITHUB_TOKEN` | optional | Raises GitHub API rate limits for repo cloning. |

## Endpoint

Once running, the public URL is `https://<user>-<space-name>.hf.space`.
Use that value (no trailing slash) as `REACT_APP_API_BASE` in the frontend.
