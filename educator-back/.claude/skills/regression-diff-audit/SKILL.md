---
name: regression-diff-audit
description: Strictly audits the current branch's changes (committed and/or uncommitted) against its base branch to find breaking changes and regression risk before merge/deploy. Always use this skill when the user asks to "audit my changes", "check if this breaks anything", "will this change break existing functionality", "review this diff for regressions", "is it safe to merge/push this", "validate my branch before PR", or similar — even if they don't say the word "audit" explicitly. Also trigger on requests to compare the current branch/working tree against main, develop, master, or a base branch for safety, or to find untested code paths touched by a change. Requires git and shell access (Claude Code / local repo), not just a pasted diff.
---

# Regression Diff Audit

Strict, evidence-based audit of what changed in the current branch (committed + uncommitted) versus its base branch, focused on one question: **will any existing functionality break?**

This is not a style/lint review. Do not comment on formatting, naming, or code style unless it directly creates a functional risk. Every claim of risk must be backed by an actual usage site, test result, or concrete code path you inspected — never a vague "this could theoretically cause issues."

## When to run this

Trigger this whenever the user wants confidence that a change is safe: before a PR, before merging, before deploying, after a big refactor, or when they explicitly ask "did I break anything." If they just want a general code review (style, readability, architecture opinions), that's a different task — don't reach for this skill unless breakage/regression risk is the actual concern.

## Step 0: Confirm what's being compared

Default assumption: **base branch = the branch this one forked from** (usually `main`, `master`, or `develop`). Try to detect it automatically:

```bash
bash scripts/detect_base_branch.sh
```

This tries, in order: the branch's upstream tracking info, `git merge-base --fork-point`, and common default branch names present in the repo. If it can't confidently determine one, or finds multiple plausible candidates, ask the user which base branch to use — don't guess silently on an ambiguous repo.

State your assumption back to the user in one line before proceeding (e.g. "Comparing `feature/x` against `origin/main`, including uncommitted changes.") so they can correct it before you do the full audit.

## Step 1: Gather the full change set

Committed changes can hide behind uncommitted changes that undo or extend them, so **always gather both** unless the user explicitly says "committed only":

```bash
bash scripts/gather_diff.sh <base_ref>
```

This writes three things to a scratch dir (printed at the end):

- `committed.diff` — `git diff <merge-base>...HEAD`
- `uncommitted.diff` — `git diff HEAD` (unstaged) + `git diff --cached` (staged), combined
- `changed_files.txt` — deduplicated list of every file touched by either

Read the diffs yourself (`view` or `cat`) rather than trusting a summary — you need the actual line-level changes to reason about behavior, not just filenames.

## Step 2: Map changes to affected surface area

For every changed file, identify what actually changed at the symbol level, not just "file X was edited":

1. **Changed symbols**: functions, methods, classes, exported constants, API routes/handlers, config keys, database schema/migrations, CLI flags, env vars — anything another part of the codebase or an external caller could depend on.
2. **Nature of the change** for each symbol, classified as:
   - **Signature change** (params added/removed/reordered/retyped, return type/shape changed)
   - **Behavior change** (same signature, different logic/output/side effects)
   - **Removal** (symbol, route, field, or file deleted or renamed)
   - **Addition** (new symbol/route/field — lowest risk, but check for naming collisions and default-value assumptions elsewhere)
3. Skip pure additions with no interaction with existing code from the deep-dive in Step 3 — flag them as low-risk and move on. Concentrate effort on signature changes, behavior changes, and removals.

## Step 3: Find every real usage site — this is the core of the audit

For each changed/removed symbol from Step 2, search the **entire repo** (not just the diff) for callers/consumers:

```bash
bash scripts/find_usages.sh "<symbol_name>"
```

This runs a language-aware search (ripgrep if available, falling back to grep) across source files, excluding the diff's own file, and also checks:

- Non-code references: config files, IaC/YAML, OpenAPI/GraphQL schemas, SQL migrations, docs referencing the symbol
- String-based references for dynamic languages (e.g. `getattr`, reflection, dependency-injection tokens, route strings) where static search alone would miss the real caller

For every usage site found, open it and actually check: does it still work against the new signature/behavior? Don't assume compatibility — trace the actual data flow. If a caller passes 3 args to a function that now expects 4, that's a **confirmed break**, not a "possible" one — say so plainly.

If a symbol was removed or renamed with zero remaining usages found, note that too (confirms it's safe to remove) — absence of usages is itself a finding, not something to skip silently.

## Step 4: Run the existing verification suite

Don't just reason statically — actually execute what the repo already has to verify behavior:

```bash
bash scripts/run_checks.sh
```

This auto-detects and runs, if present: the test suite (`npm test`/`pytest`/`go test`/`cargo test`/etc.), the build/typecheck step (`tsc`, `go build`, `mypy`, etc.), and lint **only insofar as lint failures indicate a real type/reference error**, not style. Capture full output — pass/fail counts, and the actual failing test names/assertions, not just "tests failed."

If there is no test suite, or the affected files have no test coverage at all, say so explicitly — this is itself a major finding, not something to quietly skip.

## Step 5: Identify untested code paths touched by the change

This is required, not optional, per how this skill should be used:

1. From the usage sites in Step 3 and the test run in Step 4, determine which changed lines/branches are actually exercised by an existing test (a passing test that calls the changed code is coverage; a test that never reaches the changed branch is not).
2. For each changed function/route/branch with **no** test coverage, note it as an untested path — especially:
   - New conditional branches (new `if`/`else`/`switch` cases, new error-handling paths)
   - Edge cases implied by the diff (empty input, null/undefined, boundary values, new error types) that aren't in any test file
   - Any removed test that used to cover code still present after the change (a shrinking test suite around touched code is a red flag)
3. Where feasible, propose the specific test case(s) that should be added (input → expected behavior) rather than just saying "needs more tests."

If a language-appropriate coverage tool is available and fast enough to run (e.g. `--coverage`/`nyc`/`coverage.py`) use it to confirm gaps precisely instead of estimating; otherwise reason from what you read in Step 3/4.

## Step 6: Classify and report

Build the report using this severity scale — assign every finding one of these, don't invent new labels:

- **BREAKING** — confirmed incompatibility: a real caller/consumer will fail or behave incorrectly given the new code, verified by inspection or a failing test.
- **HIGH RISK** — no confirmed break, but a behavior/signature change on a symbol with real external usage and no test coverage exercising the changed path.
- **MEDIUM RISK** — behavior change on a code path with partial or indirect test coverage, or a removal with only string/dynamic (unverifiable-by-search) references.
- **LOW RISK** — additive change, or a changed symbol with no usages found and full test coverage.
- **INFO** — untested paths, missing test suite, or coverage gaps that aren't tied to a specific confirmed risk but should be known.

### Output format (produce both)

**1. Inline chat summary**, structured as:

```
## Regression Audit: <branch> vs <base>

**Verdict: SAFE TO MERGE | RISKY — REVIEW NEEDED | DO NOT MERGE**

- Files changed: N (committed) + M (uncommitted)
- Tests: <pass/fail counts, or "no test suite found">
- Build/typecheck: <pass/fail>

### 🔴 BREAKING (N)
- <symbol/file:line> — <what breaks, and where> — evidence: <usage site or failing test>

### 🟠 HIGH RISK (N)
...

### 🟡 MEDIUM RISK (N)
...

### 🟢 LOW RISK (N)
...

### ℹ️ Untested paths / gaps (N)
- <path/function> — <what's untested> — suggested test: <input → expected>
```

Pick the verdict strictly: any BREAKING finding → "DO NOT MERGE". Any HIGH RISK with no BREAKING → "RISKY — REVIEW NEEDED". Otherwise → "SAFE TO MERGE", but still list MEDIUM/LOW/INFO findings underneath so nothing is hidden.

**2. Markdown report file**, saved to the repo at `./audit-reports/regression-audit-<branch>-<YYYYMMDD-HHMMSS>.md` (create the directory if needed), containing everything in the inline summary plus, for every BREAKING and HIGH RISK finding: the actual diff snippet, the actual usage-site code snippet, and your reasoning connecting them. This file is the evidence trail — someone should be able to review it without re-running the audit.

After writing the file, tell the user its path. Don't ask permission to create the `audit-reports/` directory or write the file — that's the expected output of this skill — but do note in your reply that you created it, in case they'd rather `.gitignore` it or place reports elsewhere next time.

See `references/example-report.md` for a calibration example of the level of specificity expected in findings (exact file:line, exact evidence, exact suggested test — never vague generalities).

## Strictness rules — do not violate these

- Never mark something LOW RISK or SAFE just because you didn't have time to check it — if you didn't verify it, it's at least MEDIUM RISK with a note that it needs manual review, or explicitly listed as "not verified: <reason>".
- Never soften a BREAKING finding into HIGH RISK to make the verdict look better. If a caller will fail, say it will fail.
- Never rely solely on the diff hunk to judge safety — you must check actual call sites via Step 3 before calling anything safe.
- If `run_checks.sh` can't run the suite (missing deps, no network, etc.), say so explicitly in the report as a limitation — don't silently treat it as "tests passed."
- If the repo is large enough that full usage-search truncates results, say so and note which symbols may have unverified usages, rather than presenting partial results as complete.
