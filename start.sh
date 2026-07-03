#!/usr/bin/env bash
# start.sh — bare-metal launcher (no Docker)
# Starts FastAPI backend (port 8002) + React dev server (port 3000)
# PIDs are written to .pids so stop.sh can cleanly shut everything down.
#
# Usage:
#   ./start.sh          # start both services
#   ./stop.sh           # stop both services
#   ./stop.sh restart   # stop then start

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.pids"
LOG_DIR="$ROOT/logs"

mkdir -p "$LOG_DIR"

# ── Colour helpers ─────────────────────────────────────────────────────────────
_green() { printf '\033[32m%s\033[0m\n' "$*"; }
_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
_dim()   { printf '\033[2m%s\033[0m\n'  "$*"; }

# ── Guard: already running ─────────────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PID_FILE"
  if kill -0 "${BACKEND_PID:-0}" 2>/dev/null || kill -0 "${FRONTEND_PID:-0}" 2>/dev/null; then
    _red "GitMind appears to already be running (see $PID_FILE)."
    echo "  Run ./stop.sh first, or ./stop.sh restart to restart."
    exit 1
  fi
  rm -f "$PID_FILE"
fi

# ── Pre-flight checks ──────────────────────────────────────────────────────────

if [[ ! -f "$ROOT/backend/.env" ]]; then
  _red "ERROR: backend/.env missing."
  echo "  cp backend/.env.example backend/.env"
  echo "  Then add: GROQ_API_KEY=gsk_..."
  exit 1
fi

if [[ ! -d "$ROOT/backend/venv" ]]; then
  echo "Setting up Python venv..."
  python3 -m venv "$ROOT/backend/venv"
  "$ROOT/backend/venv/bin/pip" install --upgrade pip -q
  "$ROOT/backend/venv/bin/pip" install -r "$ROOT/backend/requirements.txt" -q
  echo "Python venv ready."
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Installing npm packages..."
  ( cd "$ROOT/frontend" && npm install --legacy-peer-deps --silent )
  echo "npm packages ready."
fi

# ── Start backend ──────────────────────────────────────────────────────────────
echo ""
echo "Starting backend on http://127.0.0.1:8002 ..."
(
  cd "$ROOT/backend" || exit
  source venv/bin/activate
  exec uvicorn main:app --host 127.0.0.1 --port 8002 --reload \
    >> "$LOG_DIR/backend.log" 2>&1
) &
BACKEND_PID=$!

# Wait for backend health (up to 30 s)
BACKEND_UP=0
printf "  Waiting for backend"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8002/health &>/dev/null; then
    BACKEND_UP=1
    printf " ✓\n"
    break
  fi
  printf "."
  sleep 1
done

if [[ "$BACKEND_UP" -eq 0 ]]; then
  printf " ✗\n"
  _red "  Backend did not start within 30 s. Check logs/backend.log."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi

# ── Start frontend ─────────────────────────────────────────────────────────────
echo "Starting frontend on http://localhost:3000 ..."
(
  cd "$ROOT/frontend" || exit
  BROWSER=none REACT_APP_API_BASE=http://127.0.0.1:8002 npm start \
    >> "$LOG_DIR/frontend.log" 2>&1
) &
FRONTEND_PID=$!

# ── Write PID file ─────────────────────────────────────────────────────────────
cat > "$PID_FILE" <<EOF
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
EOF

echo ""
_green "  GitMind running (bare-metal)"
echo "  Backend:   http://127.0.0.1:8002"
echo "  Frontend:  http://localhost:3000"
echo "  Logs:      logs/backend.log  |  logs/frontend.log"
echo "  Stop:      ./stop.sh"
echo ""
