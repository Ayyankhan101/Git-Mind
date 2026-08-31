# Contributing to GitMind

Thanks for your interest in contributing! This document covers how to get started.

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Redis (optional, for caching)

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your GitHub token
uvicorn main:app --reload --port 8002
```

### Frontend
```bash
cd frontend
npm install
npm start  # runs on port 3000
```

## Running Tests

```bash
# Backend (245 tests)
cd backend && pytest -v

# Frontend (164 tests)
cd frontend && npm test
```

## Code Style

- **Python**: ruff for linting, mypy for type checks
- **JavaScript**: ESLint with React rules
- Run `make lint` from project root to check both

## Pull Request Process

1. Fork the repo and create a branch from `develop`
2. Add tests for any new functionality
3. Ensure all tests pass
4. Update documentation if needed
5. Submit a PR against `develop` (not `main`)

## Reporting Bugs

Use the [Bug Report](https://github.com/Ayyankhan101/Git-Mind/issues/new?template=bug_report.md) template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS info
- Console errors (if any)

## Feature Requests

Use the [Feature Request](https://github.com/Ayyankhan101/Git-Mind/issues/new?template=feature_request.md) template. Describe the problem you're trying to solve, not just the solution.

## Architecture

- `backend/` — FastAPI server, AI agent orchestration, GitHub API integration
- `frontend/` — React SPA with dashboard, visualizations, and report generation
- `backend/routes/` — API endpoint handlers
- `backend/services/` — Business logic and middleware
- `backend/agents/` — AI agent implementations (architecture, security, CVE, etc.)
- `frontend/src/components/` — React components organized by feature tab
