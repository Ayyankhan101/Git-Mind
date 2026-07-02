#!/usr/bin/env bash
# ============================================================
# ci-analyze.sh — Shared analysis trigger/poll/fetch for CI.
#
# Usage:
#   ./scripts/ci-analyze.sh <repo_url> <gh_token> <api_url>
#
# Env vars (optional):
#   ANALYSIS_TIMEOUT  — max seconds to wait (default: 300)
#   POLL_INTERVAL     — seconds between polls (default: 5)
#
# Outputs (via env):
#   ANALYSIS_SESSION_ID
#   ANALYSIS_SCORE
#   ANALYSIS_GRADE
#   ANALYSIS_SEC_COUNT
#   ANALYSIS_CVE_COUNT
#   ANALYSIS_CRIT_COUNT
#   ANALYSIS_HIGH_COUNT
#   ANALYSIS_REPO_NAME
#   ANALYSIS_CACHED (true/false)
#
# Exit codes:
#   0 — success
#   1 — analysis failed or timed out
# ============================================================
set -euo pipefail

REPO_URL="${1:?repo_url required}"
GH_TOKEN="${2:?gh_token required}"
API_URL="${3:?api_url required}"

TIMEOUT="${ANALYSIS_TIMEOUT:-300}"
POLL="${POLL_INTERVAL:-5}"

# ── Trigger ──────────────────────────────────────────────────
RESPONSE=$(curl -sf -X POST "$API_URL/analyze" \
  -H "Content-Type: application/json" \
  -H "X-GH-Token: $GH_TOKEN" \
  -d "{\"repo_url\": \"$REPO_URL\", \"gh_token\": \"$GH_TOKEN\"}" || echo '{"error":"request failed"}')

if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "::error::Failed to trigger analysis: $(echo "$RESPONSE" | jq -r '.error')"
  exit 1
fi

CACHED=$(echo "$RESPONSE" | jq -r '.cached // false')

# ── Poll ─────────────────────────────────────────────────────
if [ "$CACHED" = "true" ]; then
  SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
else
  TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
  SESSION_ID=""

  for i in $(seq 1 $((TIMEOUT / POLL))); do
    TASK=$(curl -sf "$API_URL/task/$TASK_ID" \
      -H "X-GH-Token: $GH_TOKEN" || echo '{"status":"pending"}')
    STATUS=$(echo "$TASK" | jq -r '.status')

    if [ "$STATUS" = "completed" ]; then
      SESSION_ID=$(echo "$TASK" | jq -r '.result.session_id')
      break
    elif [ "$STATUS" = "failed" ]; then
      echo "::error::Analysis failed: $(echo "$TASK" | jq -r '.error')"
      exit 1
    fi
    sleep "$POLL"
  done
fi

if [ -z "$SESSION_ID" ]; then
  echo "::error::Analysis timed out after ${TIMEOUT}s"
  exit 1
fi

# ── Fetch results ────────────────────────────────────────────
RESULTS=$(curl -sf "$API_URL/analysis/$SESSION_ID" \
  -H "X-GH-Token: $GH_TOKEN" || echo '{}')

# Save full JSON for downstream steps
RESULTS_FILE="${GITHUB_WORKSPACE:-/tmp}/gitmind-results.json"
echo "$RESULTS" > "$RESULTS_FILE"

# ── Export vars ──────────────────────────────────────────────
echo "ANALYSIS_SESSION_ID=$SESSION_ID"
echo "ANALYSIS_SCORE=$(echo "$RESULTS" | jq -r '.health.score // "N/A"')"
echo "ANALYSIS_GRADE=$(echo "$RESULTS" | jq -r '.health.grade // "N/A"')"
echo "ANALYSIS_SEC_COUNT=$(echo "$RESULTS" | jq -r '.security_findings | length')"
echo "ANALYSIS_CVE_COUNT=$(echo "$RESULTS" | jq -r '.cve_findings | length')"
echo "ANALYSIS_CRIT_COUNT=$(echo "$RESULTS" | jq -r '[.security_findings[] | select(.severity == "critical")] | length')"
echo "ANALYSIS_HIGH_COUNT=$(echo "$RESULTS" | jq -r '[.security_findings[] | select(.severity == "high")] | length')"
echo "ANALYSIS_REPO_NAME=$(echo "$RESULTS" | jq -r '.repo_name // "unknown"')"
echo "ANALYSIS_CACHED=$CACHED"
