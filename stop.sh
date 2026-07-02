#!/usr/bin/env bash
# stop.sh — stop bare-metal GitMind processes started by start.sh
#
# Usage:
#   ./stop.sh            # stop backend + frontend
#   ./stop.sh restart    # stop then start

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.pids"

_green() { printf '\033[32m%s\033[0m\n' "$*"; }
_dim()   { printf '\033[2m%s\033[0m\n'  "$*"; }

_kill_pid() {
  local name="$1" pid="$2"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    _dim "  $name not running."
    return
  fi
  echo "  Stopping $name (PID $pid)..."
  kill "$pid" 2>/dev/null || true
  # Wait up to 5 s for graceful exit
  local i=0
  while kill -0 "$pid" 2>/dev/null && (( i < 5 )); do
    sleep 1; (( i++ )) || true
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "  Force-killing $name..."
    kill -9 "$pid" 2>/dev/null || true
  fi
}

echo ""
if [[ ! -f "$PID_FILE" ]]; then
  _dim "No .pids file found — nothing to stop."
  echo ""
else
  # shellcheck disable=SC1090
  source "$PID_FILE"
  _kill_pid "backend"  "${BACKEND_PID:-}"
  _kill_pid "frontend" "${FRONTEND_PID:-}"
  rm -f "$PID_FILE"
  _green "  GitMind stopped."
  echo ""
fi

if [[ "${1:-}" == "restart" ]]; then
  echo "Restarting..."
  exec "$ROOT/start.sh"
fi
