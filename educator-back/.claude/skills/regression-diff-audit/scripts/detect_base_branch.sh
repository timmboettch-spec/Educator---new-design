#!/usr/bin/env bash
# Tries to figure out which branch the current branch forked from.
# Prints candidate(s). If more than one plausible candidate is found,
# prints all of them so the caller (Claude) can ask the user to pick.

set -uo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
echo "Current branch: ${current_branch}"

candidates=()

# 1. Upstream tracking branch, if set
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
if [ -n "${upstream}" ]; then
    # If upstream IS the current branch's own remote tracking (common case),
    # walk to what it was forked from instead — upstream of a feature branch
    # is often itself, so this is just informational.
    echo "Tracking upstream: ${upstream}"
fi

# 2. Common default branch names that actually exist locally or on origin
for name in main master develop trunk; do
    if git show-ref --verify --quiet "refs/heads/${name}"; then
        candidates+=("${name}")
    elif git show-ref --verify --quiet "refs/remotes/origin/${name}"; then
        candidates+=("origin/${name}")
    fi
done

# 3. Deduplicate
unique_candidates=($(printf "%s\n" "${candidates[@]}" | awk '!seen[$0]++'))

if [ "${#unique_candidates[@]}" -eq 0 ]; then
    echo "No common base branch (main/master/develop/trunk) found."
    echo "ACTION: ask the user which branch to compare against."
    exit 2
fi

echo ""
echo "Candidate base branches found:"
for c in "${unique_candidates[@]}"; do
    merge_base=$(git merge-base HEAD "${c}" 2>/dev/null || echo "unknown")
    ahead_behind=$(git rev-list --left-right --count "HEAD...${c}" 2>/dev/null || echo "?")
    echo "  - ${c}  (merge-base: ${merge_base}, ahead/behind HEAD...${c}: ${ahead_behind})"
done

if [ "${#unique_candidates[@]}" -eq 1 ]; then
    echo ""
    echo "RECOMMENDED_BASE=${unique_candidates[0]}"
else
    echo ""
    echo "Multiple candidates found — confirm with the user which one is the real base before proceeding."
fi
