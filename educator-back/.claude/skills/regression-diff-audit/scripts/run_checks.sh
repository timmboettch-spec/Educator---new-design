#!/usr/bin/env bash
# Auto-detects the project's ecosystem and runs its existing test suite,
# build/typecheck step, and (where meaningful) lint. Captures full output.
# Does NOT invent test commands the repo doesn't already have configured.

set -uo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: not inside a git repository" >&2
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "${REPO_ROOT}"

ran_anything=false

run_step () {
    local label="$1"
    shift
    echo ""
    echo "=== ${label}: $* ==="
    if "$@"; then
        echo "--- RESULT: ${label} PASSED ---"
    else
        echo "--- RESULT: ${label} FAILED (exit $?) ---"
    fi
}

# --- Node.js / JS / TS ---
if [ -f "package.json" ]; then
    ran_anything=true
    if grep -q '"test"' package.json 2>/dev/null; then
        if [ -d "node_modules" ]; then
            run_step "Node test suite" npm test --silent
        else
            echo "NOTE: package.json has a test script but node_modules/ is missing — run 'npm ci' or 'npm install' first, or this check will fail on missing deps, not on your changes."
        fi
    else
        echo "NOTE: package.json found but no 'test' script defined."
    fi
    if grep -q '"build"' package.json 2>/dev/null && [ -d "node_modules" ]; then
        run_step "Node build" npm run build --silent
    fi
    if grep -q '"typecheck"' package.json 2>/dev/null && [ -d "node_modules" ]; then
        run_step "TypeScript typecheck" npm run typecheck --silent
    elif [ -f "tsconfig.json" ] && [ -x "node_modules/.bin/tsc" ]; then
        run_step "TypeScript typecheck (tsc --noEmit)" node_modules/.bin/tsc --noEmit
    fi
fi

# --- Python ---
if [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "requirements.txt" ]; then
    ran_anything=true
    if command -v pytest >/dev/null 2>&1; then
        run_step "Python test suite (pytest)" pytest -q
    else
        echo "NOTE: Python project detected but pytest is not installed/available."
    fi
    if command -v mypy >/dev/null 2>&1 && { [ -f "mypy.ini" ] || [ -f "pyproject.toml" ]; }; then
        run_step "Python typecheck (mypy)" mypy .
    fi
fi

# --- Go ---
if [ -f "go.mod" ]; then
    ran_anything=true
    run_step "Go test suite" go test ./...
    run_step "Go build" go build ./...
fi

# --- Rust ---
if [ -f "Cargo.toml" ]; then
    ran_anything=true
    run_step "Rust test suite" cargo test
    run_step "Rust build" cargo build
fi

# --- Java / Maven ---
if [ -f "pom.xml" ]; then
    ran_anything=true
    run_step "Maven test suite" mvn -q test
fi

# --- Java / Gradle ---
if [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
    ran_anything=true
    if [ -x "./gradlew" ]; then
        run_step "Gradle test suite" ./gradlew test
    fi
fi

if [ "${ran_anything}" = false ]; then
    echo "No recognized project/test configuration found (checked package.json, pyproject.toml/setup.py/requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle)."
    echo "IMPORTANT: report this as a limitation — do not claim tests passed if none were found/run."
fi
