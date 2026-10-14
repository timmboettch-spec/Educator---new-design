#!/usr/bin/env bash
# Gives a fast orientation to a repo: stack, structure, test/lint/CI setup,
# and any existing architecture documentation worth reading before planning.

set -uo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "${REPO_ROOT}"

echo "=== Repo root ==="
echo "${REPO_ROOT}"

echo ""
echo "=== Top-level structure (2 levels deep, excluding common noise) ==="
find . -maxdepth 2 \
    -not -path '*/node_modules*' -not -path '*/.git*' \
    -not -path '*/dist*' -not -path '*/build*' -not -path '*/vendor*' \
    -not -path '*/.venv*' -not -path '*/venv*' -not -path '*/__pycache__*' -not -path '*/.audit-scratch*' -not -path '*/plans*' \
    | sort

echo ""
echo "=== Detected stack/manifests ==="
for f in package.json pyproject.toml setup.py requirements.txt go.mod Cargo.toml pom.xml build.gradle build.gradle.kts Gemfile composer.json; do
    if [ -f "$f" ]; then
        echo "--- $f ---"
        cat "$f"
        echo ""
    fi
done

echo ""
echo "=== Test framework signals ==="
for pattern in "jest.config*" "vitest.config*" "pytest.ini" "conftest.py" "*.spec.ts" "*_test.go" "phpunit.xml"; do
    matches=$(find . -maxdepth 3 -iname "${pattern}" -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null | head -5)
    if [ -n "${matches}" ]; then
        echo "Found matching '${pattern}':"
        echo "${matches}"
    fi
done

echo ""
echo "=== Lint/format config ==="
for f in .eslintrc* .prettierrc* ruff.toml .flake8 pyproject.toml .golangci.yml rustfmt.toml; do
    if compgen -G "$f" > /dev/null 2>&1; then
        echo "Found: $f"
    fi
done

echo ""
echo "=== CI config ==="
find . -maxdepth 3 -path '*.github/workflows*' -o -iname ".gitlab-ci.yml" -o -iname "Jenkinsfile" -o -iname ".circleci" 2>/dev/null | grep -v node_modules | head -10

echo ""
echo "=== Existing architecture/design docs (read these before planning) ==="
find . -maxdepth 3 \( -iname "ARCHITECTURE*" -o -iname "DESIGN*" -o -ipath "*adr*" -o -iname "CONTRIBUTING*" \) \
    -not -path '*/node_modules*' -not -path '*/.git*' 2>/dev/null
if [ -d "docs" ]; then
    echo "docs/ directory contents:"
    find docs -maxdepth 2 -type f | sort
fi

echo ""
echo "=== Recent commit history (last 15) — useful for spotting recent related work ==="
git log --oneline -15 2>/dev/null
