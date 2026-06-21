#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# deploy-hf.sh — Sync refactored backend/ into gitmind-backend-space/
#              and push to Hugging Face Spaces.
#
# Prerequisites (one-time):
#   huggingface-cli login    # or:
#   git remote set-url space https://USER:HF_TOKEN@huggingface.co/spaces/Ak001z/gitmind-backend
#
# Usage:
#   ./scripts/deploy-hf.sh [commit-message]
#
# Default commit message: "sync: deploy refactored backend"
#
# After deploy, set Vercel env:
#   vercel env add REACT_APP_API_BASE https://Ak001z-gitmind-backend.hf.space
# ============================================================

HF_DIR="$(cd "$(dirname "$0")/../gitmind-backend-space" && pwd)"
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
MSG="${1:-sync: deploy refactored backend}"

echo "==> Syncing backend/ -> gitmind-backend-space/"

rsync -av --delete \
  --exclude='.git/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.chroma/' \
  --exclude='.chroma_registry.json' \
  --exclude='.llm_cache/' \
  --exclude='analyses/' \
  --exclude='gitmind.db' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='.pytest_cache/' \
  --exclude='tests/' \
  --exclude='pytest.ini' \
  --exclude='README.md' \
  --exclude='smoke_test.py' \
  --exclude='venv/' \
  --exclude='.venv/' \
  "$BACKEND_DIR/" \
  "$HF_DIR/"

echo "==> Committing in gitmind-backend-space/"
cd "$HF_DIR"
git add -A
git commit -m "$MSG" || echo "    (nothing to commit)"

echo "==> Pushing to Hugging Face Spaces (Ak001z/gitmind-backend)"
git push space main

echo "==> Done! Wait ~2 min for HF Spaces to build."
echo "    URL: https://huggingface.co/spaces/Ak001z/gitmind-backend"
echo ""
echo "==> Next: Set Vercel env var"
echo "    vercel env add REACT_APP_API_BASE https://Ak001z-gitmind-backend.hf.space"
