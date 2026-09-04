#!/usr/bin/env bash
set -euo pipefail

FILE="${RESULTS_FILE}"
if [ ! -f "$FILE" ]; then
  echo "total=0" >> "$GITHUB_OUTPUT"
  echo "passed=0" >> "$GITHUB_OUTPUT"
  echo "failed=0" >> "$GITHUB_OUTPUT"
  echo "skipped=0" >> "$GITHUB_OUTPUT"
  echo "summary=⚠️ No results" >> "$GITHUB_OUTPUT"
  echo "failed_names=" >> "$GITHUB_OUTPUT"
  exit 0
fi

TOTAL=$(jq '[.testResults[]? | .assertionResults[]?] | length' "$FILE")
PASSED=$(jq '[.testResults[]? | .assertionResults[]? | select(.status=="passed")] | length' "$FILE")
FAILED=$(jq '[.testResults[]? | .assertionResults[]? | select(.status=="failed")] | length' "$FILE")
# Anything not passed/failed (pending/todo/disabled) — Jest's assertionResults
# counts these toward the total but the old summary only reported
# passed/failed, so PASSED+FAILED never matched TOTAL and looked like a
# miscount (e.g. "211/226 passed (5 failed)" — the other 10 were pending).
SKIPPED=$((TOTAL - PASSED - FAILED))

if [ "$FAILED" -gt 0 ]; then
  SUMMARY="❌ $PASSED/$TOTAL passed ($FAILED failed"
else
  SUMMARY="✅ $PASSED/$TOTAL passed"
fi
if [ "$SKIPPED" -gt 0 ]; then
  if [ "$FAILED" -gt 0 ]; then
    SUMMARY="$SUMMARY, $SKIPPED skipped)"
  else
    SUMMARY="$SUMMARY ($SKIPPED skipped)"
  fi
elif [ "$FAILED" -gt 0 ]; then
  SUMMARY="$SUMMARY)"
fi

FAILED_NAMES=$(jq -r --arg label "$LABEL" '
  [ .testResults[]? | .assertionResults[]? | select(.status=="failed") | .fullName ]
  | unique | .[0:5] | map($label + ": " + .) | join("; ")
' "$FILE" 2>/dev/null || echo "")

echo "total=$TOTAL" >> "$GITHUB_OUTPUT"
echo "passed=$PASSED" >> "$GITHUB_OUTPUT"
echo "failed=$FAILED" >> "$GITHUB_OUTPUT"
echo "skipped=$SKIPPED" >> "$GITHUB_OUTPUT"
echo "summary=$SUMMARY" >> "$GITHUB_OUTPUT"
echo "failed_names=$FAILED_NAMES" >> "$GITHUB_OUTPUT"
