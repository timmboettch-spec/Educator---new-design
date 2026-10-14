#!/usr/bin/env bash
# Usage: search_related.sh "<keyword1>" "<keyword2>" ...
# Finds existing code, directories, tests, TODOs, and commit history related
# to a set of task keywords — so planning builds on what exists instead of
# duplicating it.

set -uo pipefail

if [ "$#" -eq 0 ]; then
    echo "ERROR: usage: search_related.sh \"<keyword1>\" [\"<keyword2>\" ...]" >&2
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
    "--glob" "!*.lock"
    "--glob" "!.audit-scratch/**"
    "--glob" "!plans/**"
)

HAS_RG=false
if command -v rg >/dev/null 2>&1; then
    HAS_RG=true
fi

for kw in "$@"; do
    echo "=================================================================="
    echo "Keyword: ${kw}"
    echo "=================================================================="

    echo "--- Matching file/directory names ---"
    find . -iname "*${kw}*" \
        -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/dist*' -not -path '*/build*' -not -path '*/vendor*' \
        -not -path '*/.audit-scratch*' -not -path '*/plans*' \
        2>/dev/null | head -20

    echo ""
    echo "--- Code matches (case-insensitive) ---"
    if [ "${HAS_RG}" = true ]; then
        rg --line-number --no-heading -i "${kw}" "${COMMON_EXCLUDES[@]}" . 2>/dev/null | head -40 || echo "(no matches)"
    else
        grep -rn -i "${kw}" \
            --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
            --exclude-dir=vendor --exclude-dir=.git \
            . 2>/dev/null | head -40 || echo "(no matches)"
    fi

    echo ""
    echo "--- TODO/FIXME/HACK mentions near this keyword ---"
    if [ "${HAS_RG}" = true ]; then
        rg --line-number --no-heading -i "(TODO|FIXME|HACK).*${kw}|${kw}.*(TODO|FIXME|HACK)" "${COMMON_EXCLUDES[@]}" . 2>/dev/null | head -10 || echo "(none found)"
    fi

    echo ""
    echo "--- Related commit history ---"
    git log --oneline -i --grep="${kw}" -10 2>/dev/null || echo "(none found)"
    echo ""
done

echo "=================================================================="
echo "Reminder: open the actual files behind these matches before writing"
echo "the plan — don't reason from filenames/snippets alone."
echo "=================================================================="
