#!/usr/bin/env bash
# GitMind launcher — Linux / macOS
# Starts FastAPI backend (port 8001) + React dev server (port 3000)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Setup checks ──────────────────────────────────────────────────────────────

if [ ! -f "backend/.env" ]; then
  echo "ERROR: backend/.env missing. Create it with: OPENAI_API_KEY=sk-..."
  exit 1
fi

if [ ! -d "backend/venv" ]; then
  echo "Setting up Python venv..."
  python3 -m venv backend/venv
  # shellcheck disable=SC1091
  source backend/venv/bin/activate
  pip install -q --upgrade pip
  pip install -q "fastapi[standard]" uvicorn langgraph langchain langchain-openai \
    langchain-text-splitters chromadb gitpython tiktoken python-dotenv diskcache \
    websockets semgrep
  deactivate
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing npm packages..."
  ( cd frontend && npm install )
fi

# ── Process management ───────────────────────────────────────────────────────

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "Stopping..."
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# ── Backend ──────────────────────────────────────────────────────────────────

echo "Starting backend on http://127.0.0.1:8001 ..."
(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  exec uvicorn main:app --host 127.0.0.1 --port 8001 --reload
) &
BACKEND_PID=$!

# Wait for backend health
for i in {1..30}; do
  if curl -sf http://127.0.0.1:8001/health >/dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  sleep 1
done

# ── Frontend ─────────────────────────────────────────────────────────────────

echo "Starting frontend on http://localhost:3000 ..."
( cd frontend && BROWSER=none npm start ) &
FRONTEND_PID=$!

echo ""
echo "──────────────────────────────────────────────"
echo "  GitMind running"
echo "  Backend:  http://127.0.0.1:8001"
echo "  Frontend: http://localhost:3000"
echo "  Ctrl+C to stop both"
echo "──────────────────────────────────────────────"

wait
