# Development

CI/CD pipeline, running the test suites, and deployment.

## CI/CD

| Workflow              | Trigger               | What it does                                                                                                     |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `build.yml`           | Push/PR to any branch | Frontend production build                                                                                        |
| `ci.yml`              | Push/PR to `main`     | Ruff/mypy/Prettier lint, backend tests + Rust build, frontend tests + build, smoke + layout audits, deploy to HF |
| `gitmind-monitor.yml` | Weekly (Mon 8am UTC)  | Re-analyze, health delta, Slack alert + GitHub issue                                                             |

---

## Testing

```
✅ Backend:  405 tests passing (pytest-asyncio)
✅ Frontend:  181 tests passing (Jest + React Testing Library)
✅ Rust:      clippy + rustfmt clean
```

```bash
# Backend
cd backend && python -m pytest tests/ -v

# Frontend
cd frontend && CI=true npx react-scripts test --watchAll=false
```

---

## Deployment

| Platform                | What                   | URL                                                                                     |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| **Hugging Face Spaces** | Backend (Docker)       | [ak001z-gitmind-backend.hf.space](https://ak001z-gitmind-backend.hf.space)             |
| **Cloudflare Pages**    | Frontend (auto-deploy) | [gitmind-frontend.pages.dev](https://gitmind-frontend.pages.dev)                        |
| **Docker Compose**      | Full stack (self-host) | `docker compose up -d --build`                                                          |
| **Any Python host**     | Backend                | Render, Fly.io, EC2, etc.                                                               |

### Quick Deploy

```bash
# Self-host full stack
docker compose up -d --build

# Deploy to HF (manual)
./scripts/deploy-hf.sh

# Frontend — push to main → Cloudflare Pages auto-deploys
```
