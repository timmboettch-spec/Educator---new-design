#!/usr/bin/env bash
# Surfaces conventions already in use in the repo, so a new plan follows
# them instead of inventing a new, inconsistent pattern.

set -uo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "${REPO_ROOT}"

echo "=== Likely source root(s) ==="
for d in src app lib pkg internal cmd services; do
    if [ -d "$d" ]; then
        echo "Found: $d/"
        find "$d" -maxdepth 2 -type d -not -path '*/node_modules*' | sort
        echo ""
    fi
done

echo "=== Layering pattern signals (controller/service/repository, MVC, hexagonal, feature-folders) ==="
find . -maxdepth 4 -type d \
    \( -iname "controller*" -o -iname "service*" -o -iname "repository*" -o -iname "repositories" \
       -o -iname "handler*" -o -iname "usecase*" -o -iname "domain" -o -iname "adapter*" \
       -o -iname "port*" -o -iname "model*" -o -iname "entity*" -o -iname "feature*" \) \
    -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/dist*' -not -path '*/build*' \
    2>/dev/null | sort | head -40

echo ""
echo "=== Example of an existing 'full-stack' module (pick one to study as a template) ==="
echo "(Look for a directory containing multiple related files — that's likely one feature's full slice.)"
find . -maxdepth 3 -type d -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/dist*' \
    -not -path '*/.audit-scratch*' -not -path '*/plans*' 2>/dev/null \
    | while read -r d; do
        count=$(find "$d" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
        if [ "${count}" -ge 3 ]; then
            echo "${d} (${count} files)"
        fi
    done | sort -t'(' -k2 -rn | head -10

echo ""
echo "=== Error handling patterns (sample) ==="
if command -v rg >/dev/null 2>&1; then
    rg --line-number --no-heading -m 1 "class \w*Error|throw new|except \w+Error|errors\.New|Result<" \
        --glob '!node_modules/**' --glob '!dist/**' -g '*.{js,ts,py,go,rs,java}' . 2>/dev/null | head -15
fi

echo ""
echo "=== Logging library in use ==="
if command -v rg >/dev/null 2>&1; then
    rg -i "winston|pino|bunyan|log4j|logrus|zap|structlog|logging\.getLogger" \
        --glob '!node_modules/**' -l . 2>/dev/null | head -10
fi

echo ""
echo "=== Config/env pattern ==="
for f in .env.example .env.sample config.yaml config.yml config/default.json; do
    if [ -f "$f" ]; then
        echo "Found: $f"
    fi
done
if command -v rg >/dev/null 2>&1; then
    rg -i "process\.env\.|os\.environ|os\.Getenv|viper\.Get" --glob '!node_modules/**' -l . 2>/dev/null | head -5
fi

echo ""
echo "=== Naming convention sample (recent files) ==="
git log --name-only --pretty=format: -20 2>/dev/null | grep -v '^$' | sort -u | head -30

echo ""
echo "=== Test file naming/location convention ==="
find . -maxdepth 4 \( -iname "*.test.*" -o -iname "*.spec.*" -o -iname "*_test.*" -o -ipath "*test*" \) \
    -type f -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/dist*' 2>/dev/null | head -15
