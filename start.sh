#!/usr/bin/env bash
# GitMind launcher — Linux / macOS
# Starts FastAPI backend (port 8002) + React dev server (port 3000)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Setup checks ──────────────────────────────────────────────────────────────

if [ ! -f "backend/.env" ]; then
  echo "ERROR: backend/.env missing. Create it with: GROQ_API_KEY=gsk_..."
  exit 1
fi

if [ ! -d "backend/venv" ]; then
  echo "Setting up Python venv..."
  python3 -m venv backend/venv
  # shellcheck disable=SC1091
  source backend/venv/bin/activate
  pip install --upgrade pip
  pip install -r backend/requirements.txt
  deactivate
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing npm packages..."
  ( cd frontend && npm install --legacy-peer-deps )
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

echo "Starting backend on http://127.0.0.1:8002 ..."
(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  exec uvicorn main:app --host 127.0.0.1 --port 8002 --reload
) &
BACKEND_PID=$!

# Wait for backend health
for i in {1..30}; do
  if curl -sf http://127.0.0.1:8002/health >/dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  sleep 1
done

# ── Frontend ─────────────────────────────────────────────────────────────────

echo "Starting frontend on http://localhost:3000 ..."
( cd frontend && BROWSER=none REACT_APP_API_BASE=http://127.0.0.1:8002 npm start ) &
FRONTEND_PID=$!

echo ""
echo "──────────────────────────────────────────────"
echo "  GitMind running"
echo "  Backend:  http://127.0.0.1:8002"
echo "  Frontend: http://localhost:3000"
echo "  Ctrl+C to stop both"
echo "──────────────────────────────────────────────"

wait
