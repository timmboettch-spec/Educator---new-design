#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(pwd)"

# Run the lint command from working-directory. Lint tools commonly exit
# non-zero when they find issues, but we still need the report file, so this
# step must not fail the build on the command's own exit code.
(cd "$WORKING_DIRECTORY" && eval "$LINT_COMMAND") || true

REPORT_PATH="$WORKING_DIRECTORY/$REPORT_FILE"

if [ ! -f "$REPORT_PATH" ]; then
  echo "::error::Lint report file not found at $REPORT_PATH"
  exit 1
fi

ERRORS=$(jq '[.[].errorCount] | add // 0' "$REPORT_PATH")
WARNINGS=$(jq '[.[].warningCount] | add // 0' "$REPORT_PATH")

BASELINE_ERRORS=0
BASELINE_WARNINGS=0
if [ -f "$REPO_ROOT/$BASELINE_FILE" ]; then
  BASELINE_ERRORS=$(jq --arg key "$BASELINE_KEY" '.[$key].errors // 0' "$REPO_ROOT/$BASELINE_FILE")
  BASELINE_WARNINGS=$(jq --arg key "$BASELINE_KEY" '.[$key].warnings // 0' "$REPO_ROOT/$BASELINE_FILE")
fi

echo "errors=$ERRORS"                     >> "$GITHUB_OUTPUT"
echo "warnings=$WARNINGS"                 >> "$GITHUB_OUTPUT"
echo "baseline-errors=$BASELINE_ERRORS"   >> "$GITHUB_OUTPUT"
echo "baseline-warnings=$BASELINE_WARNINGS" >> "$GITHUB_OUTPUT"

echo "Lint: errors=$ERRORS (baseline $BASELINE_ERRORS), warnings=$WARNINGS (baseline $BASELINE_WARNINGS)"

if [ "$ERRORS" -gt "$BASELINE_ERRORS" ] || [ "$WARNINGS" -gt "$BASELINE_WARNINGS" ]; then
  echo "verdict=fail" >> "$GITHUB_OUTPUT"
  echo "::error::Lint regressed against baseline '$BASELINE_KEY' (errors: $ERRORS/$BASELINE_ERRORS, warnings: $WARNINGS/$BASELINE_WARNINGS)"
  exit 1
elif [ "$ERRORS" -lt "$BASELINE_ERRORS" ] || [ "$WARNINGS" -lt "$BASELINE_WARNINGS" ]; then
  echo "verdict=improved" >> "$GITHUB_OUTPUT"
  echo "::notice::Lint improved against baseline '$BASELINE_KEY' (errors: $ERRORS/$BASELINE_ERRORS, warnings: $WARNINGS/$BASELINE_WARNINGS) — consider lowering the baseline"
else
  echo "verdict=flat" >> "$GITHUB_OUTPUT"
fi
