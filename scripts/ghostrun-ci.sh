#!/usr/bin/env bash
set -e

# =============================================================================
# ghostrun-ci.sh — Turnkey CI integration script for Ghostrun
# Usage:
#   GHOSTRUN_SUITE=smoke ./scripts/ghostrun-ci.sh
#   GHOSTRUN_FLOW=flows/login.json ./scripts/ghostrun-ci.sh
# =============================================================================

echo ""
echo "============================================================"
echo "  Ghostrun CI Integration Script"
echo "  Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Ensure ghostrun CLI is installed
# ---------------------------------------------------------------------------
echo "[1/4] Checking ghostrun CLI..."
if ! command -v ghostrun &>/dev/null; then
  echo "  ghostrun not found — installing via npm..."
  npm install -g ghostrun
else
  echo "  ghostrun found: $(ghostrun --version)"
fi

# ---------------------------------------------------------------------------
# Step 2: Ensure Playwright Chromium browser is installed
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Checking Playwright Chromium browsers..."
if ! npx playwright --version &>/dev/null 2>&1 || \
   ! node -e "require('playwright').chromium.executablePath()" &>/dev/null 2>&1; then
  echo "  Chromium not found — installing via Playwright..."
  npx playwright install chromium --with-deps
else
  echo "  Playwright Chromium is available."
fi

# ---------------------------------------------------------------------------
# Step 3: Initialize Ghostrun (non-interactive, skip if already initialized)
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Running ghostrun init..."
if [ -d ".ghostrun" ]; then
  echo "  .ghostrun/ already exists — skipping init."
else
  ghostrun init --yes
fi

# ---------------------------------------------------------------------------
# Step 4: Run the suite or flow
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Running tests..."

GHOSTRUN_EXIT_CODE=0

if [ -n "${GHOSTRUN_SUITE}" ]; then
  echo "  Mode: suite"
  echo "  Suite: ${GHOSTRUN_SUITE}"
  echo ""
  ghostrun suite:run "${GHOSTRUN_SUITE}" --ci --reporter junit || GHOSTRUN_EXIT_CODE=$?

elif [ -n "${GHOSTRUN_FLOW}" ]; then
  echo "  Mode: single flow"
  echo "  Flow: ${GHOSTRUN_FLOW}"
  echo ""
  ghostrun run "${GHOSTRUN_FLOW}" --ci --reporter junit || GHOSTRUN_EXIT_CODE=$?

else
  echo ""
  echo "  ERROR: No test target specified."
  echo ""
  echo "  Usage:"
  echo "    GHOSTRUN_SUITE=<suite-name>  $0   # run a named suite"
  echo "    GHOSTRUN_FLOW=<flow-path>    $0   # run a single flow"
  echo ""
  echo "  Environment variables:"
  echo "    GHOSTRUN_SUITE    Name of the suite to run (ghostrun suite:run)"
  echo "    GHOSTRUN_FLOW     Path or name of a single flow (ghostrun run)"
  echo "    GITHUB_TOKEN      GitHub token for PR comment posting (optional)"
  echo "    PR_NUMBER         Pull request number for comment posting (optional)"
  echo ""
  exit 1
fi

# ---------------------------------------------------------------------------
# Optional: Post results as a PR comment when GitHub context is available
# ---------------------------------------------------------------------------
if [ -n "${GITHUB_TOKEN}" ] && [ -n "${PR_NUMBER}" ]; then
  echo ""
  echo "[Post] Posting results to PR #${PR_NUMBER}..."

  if [ "${GHOSTRUN_EXIT_CODE}" -eq 0 ]; then
    RESULT_EMOJI="green_circle"
    RESULT_TEXT="All Ghostrun tests passed."
  else
    RESULT_EMOJI="red_circle"
    RESULT_TEXT="Ghostrun tests failed (exit code ${GHOSTRUN_EXIT_CODE})."
  fi

  REPO="${GITHUB_REPOSITORY:-}"
  if [ -z "${REPO}" ]; then
    echo "  GITHUB_REPOSITORY not set — skipping PR comment."
  else
    COMMENT_BODY=":${RESULT_EMOJI}: **Ghostrun CI** — ${RESULT_TEXT}"
    curl -s -X POST \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"body\": \"${COMMENT_BODY}\"}" \
      "https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments" \
      > /dev/null && echo "  Comment posted." || echo "  Failed to post comment (non-fatal)."
  fi
fi

# ---------------------------------------------------------------------------
# Exit with ghostrun's exit code so CI reflects actual test results
# ---------------------------------------------------------------------------
echo ""
if [ "${GHOSTRUN_EXIT_CODE}" -eq 0 ]; then
  echo "Ghostrun CI finished successfully."
else
  echo "Ghostrun CI finished with failures (exit code ${GHOSTRUN_EXIT_CODE})."
fi
echo ""
exit "${GHOSTRUN_EXIT_CODE}"
