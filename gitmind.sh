#!/usr/bin/env bash
# gitmind.sh — Docker-based launcher for GitMind
#
# Usage: ./gitmind.sh <command> [dev|prod]
#
# Commands:
#   start    Build and start containers in detached mode
#   stop     Gracefully stop containers
#   restart  Restart running containers
#   status   Show container and port status
#   logs     Tail live logs (Ctrl+C to exit)
#   build    Rebuild Docker images without starting
#   clean    Stop containers and delete volumes (destructive)
#
# Examples:
#   ./gitmind.sh start           # dev mode (default)
#   ./gitmind.sh start prod      # production mode
#   ./gitmind.sh logs dev        # tail dev logs
#   ./gitmind.sh stop

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Colour helpers ─────────────────────────────────────────────────────────────
_bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
_green() { printf '\033[32m%s\033[0m\n' "$*"; }
_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
_dim()   { printf '\033[2m%s\033[0m\n'  "$*"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
CMD="${1:-help}"
MODE="${2:-dev}"

case "$MODE" in
  dev)  COMPOSE_FILE="docker-compose.dev.yml" ;;
  prod) COMPOSE_FILE="docker-compose.yml" ;;
  *)    _red "Unknown mode '$MODE'. Use 'dev' or 'prod'."; exit 1 ;;
esac
COMPOSE="docker compose -f $COMPOSE_FILE"

# ── Helpers ───────────────────────────────────────────────────────────────────

_check_docker() {
  if ! command -v docker &>/dev/null; then
    _red "Docker not found. Install Docker Desktop or Docker Engine."
    exit 1
  fi
  if ! docker info &>/dev/null; then
    _red "Docker daemon not running. Start Docker and retry."
    exit 1
  fi
}

_check_env() {
  if [[ ! -f backend/.env ]]; then
    _red "ERROR: backend/.env missing."
    echo "  cp backend/.env.example backend/.env"
    echo "  Then set: GROQ_API_KEY=gsk_..."
    exit 1
  fi
}

_free_ports() {
  local ports=(8002 3002)
  [[ "$MODE" == "prod" ]] && ports+=(80)
  for port in "${ports[@]}"; do
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      echo "  Port $port busy (PID $pid) — sending SIGTERM..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      # SIGKILL only if still alive
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

_wait_healthy() {
  local url="http://localhost:8002/health"
  local max=60 i=0
  printf "  Waiting for backend"
  while (( i < max )); do
    if curl -sf "$url" &>/dev/null; then
      printf " ✓\n"
      return 0
    fi
    printf "."
    sleep 1
    (( i++ )) || true
  done
  printf " ✗\n"
  _red "  Backend did not become healthy after ${max}s."
  _dim "  Run: ./gitmind.sh logs $MODE"
  return 1
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_start() {
  _check_docker
  _check_env
  echo ""
  _bold "Starting GitMind [$MODE]"
  _free_ports
  $COMPOSE up -d --build
  _wait_healthy
  echo ""
  _green "  GitMind is up."
  echo "  Backend:  http://localhost:8002"
  if [[ "$MODE" == "dev" ]]; then
    echo "  Frontend: http://localhost:3002"
  else
    echo "  Frontend: http://localhost:80"
  fi
  echo ""
  _dim "  Logs:    ./gitmind.sh logs $MODE"
  _dim "  Stop:    ./gitmind.sh stop $MODE"
  _dim "  Status:  ./gitmind.sh status $MODE"
  echo ""
}

cmd_stop() {
  _check_docker
  echo ""
  _bold "Stopping GitMind [$MODE]"
  $COMPOSE down --timeout 10
  _green "  Stopped."
  echo ""
}

cmd_restart() {
  _check_docker
  echo ""
  _bold "Restarting GitMind [$MODE]"
  $COMPOSE restart
  _wait_healthy
  _green "  Restarted."
  echo ""
}

cmd_status() {
  _check_docker
  echo ""
  _bold "Container status [$MODE]"
  $COMPOSE ps
  echo ""
  _bold "Port status"
  for port in 8002 3002 80; do
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      _green "  :$port  in use (PID $pid)"
    else
      _dim   "  :$port  free"
    fi
  done
  echo ""
}

cmd_logs() {
  _check_docker
  $COMPOSE logs -f --tail=100
}

cmd_build() {
  _check_docker
  echo ""
  _bold "Building Docker images [$MODE]"
  $COMPOSE build
  _green "  Build complete."
  echo ""
}

cmd_clean() {
  _check_docker
  echo ""
  _bold "Cleaning GitMind [$MODE]"
  _red "  WARNING: This removes containers and all volumes (ChromaDB data will be lost)."
  read -r -p "  Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "  Aborted."; exit 0; }
  $COMPOSE down -v --timeout 10
  _green "  Cleaned."
  echo ""
}

cmd_help() {
  echo ""
  _bold "gitmind.sh — GitMind Docker launcher"
  echo ""
  echo "  Usage: ./gitmind.sh <command> [dev|prod]"
  echo ""
  echo "  Commands:"
  echo "    start    Build images and start containers (detached)"
  echo "    stop     Gracefully stop containers"
  echo "    restart  Restart running containers"
  echo "    status   Show container and port status"
  echo "    logs     Tail live container logs (Ctrl+C to exit)"
  echo "    build    Rebuild images without starting"
  echo "    clean    Stop containers and delete volumes"
  echo ""
  echo "  Mode (optional, default: dev):"
  echo "    dev      Hot-reload — backend on :8002, frontend on :3002"
  echo "    prod     Optimised build — backend on :8002, frontend on :80"
  echo ""
  echo "  Examples:"
  echo "    ./gitmind.sh start"
  echo "    ./gitmind.sh start prod"
  echo "    ./gitmind.sh logs dev"
  echo "    ./gitmind.sh stop"
  echo "    ./gitmind.sh restart dev"
  echo "    ./gitmind.sh status"
  echo ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$CMD" in
  start)   cmd_start   ;;
  stop)    cmd_stop    ;;
  restart) cmd_restart ;;
  status)  cmd_status  ;;
  logs)    cmd_logs    ;;
  build)   cmd_build   ;;
  clean)   cmd_clean   ;;
  help|-h|--help) cmd_help ;;
  *) _red "Unknown command '$CMD'."; cmd_help; exit 1 ;;
esac
