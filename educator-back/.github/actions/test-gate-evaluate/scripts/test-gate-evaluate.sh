#!/usr/bin/env bash
set -euo pipefail

FAILED_COUNT="${FAILED_COUNT:-0}"

IS_ALWAYS_STRICT_BRANCH="false"
for BRANCH in $ALWAYS_STRICT_BRANCHES; do
  if [ "$BRANCH" = "$CURRENT_BRANCH" ]; then
    IS_ALWAYS_STRICT_BRANCH="true"
    break
  fi
done

if [ "$FAILED_COUNT" -gt 0 ] && { [ "$STRICT_MODE" = "true" ] || [ "$IS_ALWAYS_STRICT_BRANCH" = "true" ]; }; then
  echo "::error::$FAILED_COUNT test(s) failed on branch '$CURRENT_BRANCH' with strict mode enforced — blocking the build"
  exit 1
elif [ "$FAILED_COUNT" -gt 0 ]; then
  echo "::warning::$FAILED_COUNT test(s) failed on branch '$CURRENT_BRANCH' but strict mode is off — not blocking the build"
  exit 0
else
  echo "All tests passed — test gate clear"
  exit 0
fi
