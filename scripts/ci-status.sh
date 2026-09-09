#!/usr/bin/env bash
# CI status right in your git workflow.
#
# Shows the GitHub Actions runs for the current branch in your terminal using
# the GitHub CLI. Works from any directory inside the repository.
#
# Usage:
#   scripts/ci-status.sh              latest runs for the current branch
#   scripts/ci-status.sh --watch      follow the latest run to completion
#   scripts/ci-status.sh --commit SHA runs that produced a specific commit
#
# Requires: git, and the GitHub CLI (gh) authenticated for this repository.
#
# Convenience aliases once installed:
#   gh ci / gh ci-watch        gh alias set ci '!bash "$(git rev-parse --show-toplevel)"/scripts/ci-status.sh "$@"'
#   git ci-status / git ci-watch   git config alias.ci-status '!bash "$(git rev-parse --show-toplevel)"/scripts/ci-status.sh'

set -euo pipefail

# Locate the repository root no matter where this script is invoked from.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$REPO_ROOT"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  echo "error: the GitHub CLI is not available or not authenticated." >&2
  echo "       run 'gh auth login' first." >&2
  exit 1
fi

BRANCH="$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD)"

case "${1:-}" in
  --watch)
    RUN_ID="$(gh run list --repo "$REPO" --branch "$BRANCH" --limit 1 \
      --json databaseId --jq '.[0].databaseId // empty')"
    if [ -z "$RUN_ID" ]; then
      echo "no workflow runs found for branch '$BRANCH'" >&2
      exit 1
    fi
    echo "watching run #$RUN_ID ($BRANCH)…"
    exec gh run watch "$RUN_ID" --repo "$REPO"
    ;;
  --commit)
    SHA="${2:?usage: ci-status.sh --commit <sha>}"
    # GitHub's head_sha filter needs the full SHA; expand abbreviations locally.
    FULL="$(git rev-parse --verify "${SHA}^{commit}" 2>/dev/null || echo "$SHA")"
    gh run list --repo "$REPO" --commit "$FULL" --limit 20 \
      --json databaseId,workflowName,event,status,conclusion,headSha \
      --jq '.[] | [.databaseId, .workflowName, .event, .status, (.conclusion // "in progress"), (.headSha[0:7])] | @tsv'
    ;;
  *)
    gh run list --repo "$REPO" --branch "$BRANCH" --limit 6
    ;;
esac
