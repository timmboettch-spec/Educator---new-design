#!/usr/bin/env bash
# Usage: find_usages.sh "<symbol_name>" [exclude_file]
# Language-aware-ish usage search across the repo. Prefers ripgrep, falls
# back to grep. Excludes common vendor/build directories and, optionally,
# the file the symbol was defined/changed in (so you see *external* callers).

set -uo pipefail

SYMBOL="${1:-}"
EXCLUDE_FILE="${2:-}"

if [ -z "${SYMBOL}" ]; then
    echo "ERROR: usage: find_usages.sh \"<symbol_name>\" [exclude_file]" >&2
    exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "${REPO_ROOT}"

COMMON_EXCLUDES=(
    "--glob" "!node_modules/**"
    "--glob" "!dist/**"
    "--glob" "!build/**"
    "--glob" "!vendor/**"
    "--glob" "!.git/**"
    "--glob" "!*.min.js"
    "--glob" "!package-lock.json"
    "--glob" "!yarn.lock"
    "--glob" "!*.lock"
)

echo "=== Usage search for: ${SYMBOL} ==="
echo ""

if command -v rg >/dev/null 2>&1; then
    echo "--- Code references (ripgrep, word-boundary match) ---"
    rg --line-number --no-heading -w "${SYMBOL}" "${COMMON_EXCLUDES[@]}" . || echo "(no matches)"
    echo ""
    echo "--- String/dynamic references (quoted symbol name — routes, DI tokens, reflection) ---"
    rg --line-number --no-heading "['\"\`]${SYMBOL}['\"\`]" "${COMMON_EXCLUDES[@]}" . || echo "(no matches)"
    echo ""
    echo "--- Non-code references (config, yaml/json, sql, docs, openapi/graphql schemas) ---"
    rg --line-number --no-heading -w "${SYMBOL}" \
        --glob "*.yml" --glob "*.yaml" --glob "*.json" --glob "*.sql" \
        --glob "*.md" --glob "*.graphql" --glob "*.proto" --glob "*.env*" \
        "${COMMON_EXCLUDES[@]}" . || echo "(no matches)"
else
    echo "(ripgrep not found, falling back to grep — slower, less precise)"
    echo "--- Code references (grep, word-boundary match) ---"
    grep -rn -w "${SYMBOL}" \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
        --exclude-dir=vendor --exclude-dir=.git \
        . || echo "(no matches)"
fi

if [ -n "${EXCLUDE_FILE}" ]; then
    echo ""
    echo "NOTE: results above include ${EXCLUDE_FILE} itself — manually disregard matches there when counting *external* callers, or re-run:"
    echo "  rg -w \"${SYMBOL}\" --glob '!${EXCLUDE_FILE}' ."
fi

echo ""
echo "Reminder: for dynamic languages, also check for reflection-style access (getattr/**/dependency injection tokens/route-string tables) that a plain text search can miss."
