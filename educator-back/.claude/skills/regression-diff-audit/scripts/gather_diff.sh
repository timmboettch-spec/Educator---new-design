#!/usr/bin/env bash
# Usage: gather_diff.sh <base_ref>
# Gathers committed diff (base...HEAD), uncommitted diff (working tree + staged),
# and a deduplicated list of changed files, into a scratch directory.

set -uo pipefail

BASE_REF="${1:-}"
if [ -z "${BASE_REF}" ]; then
    echo "ERROR: usage: gather_diff.sh <base_ref>" >&2
    exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

if ! git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
    echo "ERROR: base ref '${BASE_REF}' does not exist. Try 'git fetch' if it's a remote branch." >&2
    exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
SCRATCH_DIR="$(git rev-parse --show-toplevel)/.audit-scratch/${TS}"
mkdir -p "${SCRATCH_DIR}"

MERGE_BASE=$(git merge-base "${BASE_REF}" HEAD 2>/dev/null || echo "${BASE_REF}")

# Committed changes since divergence from base
git diff "${MERGE_BASE}...HEAD" > "${SCRATCH_DIR}/committed.diff" 2>/dev/null || true

# Uncommitted: unstaged + staged combined
{
    git diff HEAD -- . 2>/dev/null
} > "${SCRATCH_DIR}/uncommitted.diff" || true

# Changed files, deduped, from both diffs
{
    git diff --name-only "${MERGE_BASE}...HEAD" 2>/dev/null
    git diff --name-only HEAD -- . 2>/dev/null
} | sort -u > "${SCRATCH_DIR}/changed_files.txt"

COMMITTED_LINES=$(wc -l < "${SCRATCH_DIR}/committed.diff" | tr -d ' ')
UNCOMMITTED_LINES=$(wc -l < "${SCRATCH_DIR}/uncommitted.diff" | tr -d ' ')
FILE_COUNT=$(wc -l < "${SCRATCH_DIR}/changed_files.txt" | tr -d ' ')

echo "Base ref:        ${BASE_REF}"
echo "Merge base:       ${MERGE_BASE}"
echo "Scratch dir:      ${SCRATCH_DIR}"
echo "committed.diff:   ${COMMITTED_LINES} lines"
echo "uncommitted.diff: ${UNCOMMITTED_LINES} lines"
echo "changed_files.txt: ${FILE_COUNT} files"
echo ""
echo "Changed files:"
cat "${SCRATCH_DIR}/changed_files.txt"
