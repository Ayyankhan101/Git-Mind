---
tags:
  - development
aliases: [Dev Setup, Commands]
---

# Development Setup

## Prerequisites

- Node.js (see `.nvmrc`)
- Python 3.12+ (see `.python-version`)
- Rust toolchain
- Docker + docker-compose (optional)

## Quick Start

```bash
cd /home/ayyan/project/Git-Mind
make install   # Install all deps
make dev       # Run dev servers
```

## Individual Commands

```bash
# Frontend
cd frontend && npm install && npm start

# Backend
cd backend && poetry install && uvicorn main:app --reload

# Rust
cd rust-gitmind && cargo build
cd rust-sidecar && cargo build
```

## Docker

```bash
docker-compose up -d                        # Full stack
docker-compose -f docker-compose.dev.yml up -d  # Dev stack
```

## Environment

Copy `.env.example` to `.env`:

```
GROQ_API_KEY=...
CHROMA_DB_PATH=./chroma_db
```

## Testing

```bash
# Frontend
cd frontend && npm test

# Backend
cd backend && poetry run pytest

# Rust
cd rust-gitmind && cargo test
```

## opencode

```bash
opencode   # From project root
```

Config: `.opencode/opencode.json`

## Related

- [[Notes/Architecture|Architecture]] — system design
- [[Notes/Tech Stack|Tech Stack]] — technologies used
- [[Tasks/Current|Current Tasks]] — what to work on
