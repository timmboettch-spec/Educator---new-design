# lint-ratchet-against-baseline

Runs a lint command, sums `errorCount`/`warningCount` from its ESLint-format
JSON report, and compares the totals against a checked-in baseline file.
Fails the build if lint counts regress past baseline; prints a notice (not a
failure) when counts improve, prompting a baseline update. Works on both
`ubuntu-latest` and `windows-latest` runners via matching Bash/PowerShell
scripts.

## Inputs

| Name | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `working-directory` | Yes | — | Directory to run `lint-command` from, e.g. `backend` |
| `lint-command` | Yes | — | Full lint command, e.g. `npx eslint "{src,apps,libs,test}/**/*.ts" --format json --output-file eslint-report.json` |
| `report-file` | Yes | — | Path to the JSON report written by `lint-command`, relative to `working-directory` |
| `baseline-file` | Yes | — | Path to the baseline JSON file, relative to the repo root, e.g. `.github/lint-baseline.json` |
| `baseline-key` | Yes | — | Top-level key inside `baseline-file` for this app/package, e.g. `backend` |

## Outputs

| Name | Description |
| :--- | :--- |
| `errors` | Total `errorCount` summed across the report file |
| `warnings` | Total `warningCount` summed across the report file |
| `baseline-errors` | Baseline error count (0 if file/key missing) |
| `baseline-warnings` | Baseline warning count (0 if file/key missing) |
| `verdict` | `fail` \| `improved` \| `flat` |

## Permissions required

None — this action only reads files in the checked-out workspace and does not
call any cloud APIs. No Azure RBAC role is needed.

## Example — Linux runner (bash)

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: backend
      - name: Ratchet backend lint
        id: lint
        uses: Realityworks-AI/Global-Standards-Policy/.github/actions/lint-ratchet-against-baseline@main
        with:
          working-directory: backend
          lint-command: 'npx eslint "{src,apps,libs,test}/**/*.ts" --format json --output-file eslint-report.json'
          report-file: eslint-report.json
          baseline-file: .github/lint-baseline.json
          baseline-key: backend
      - run: echo "verdict was ${{ steps.lint.outputs.verdict }}"
```

## Example — Windows runner (PowerShell)

```yaml
jobs:
  lint:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: backend
      - name: Ratchet backend lint
        id: lint
        uses: Realityworks-AI/Global-Standards-Policy/.github/actions/lint-ratchet-against-baseline@main
        with:
          working-directory: backend
          lint-command: 'npx eslint "{src,apps,libs,test}/**/*.ts" --format json --output-file eslint-report.json'
          report-file: eslint-report.json
          baseline-file: .github/lint-baseline.json
          baseline-key: backend
      - run: echo "verdict was ${{ steps.lint.outputs.verdict }}"
```

## How it works (step-by-step)

1. `cd` into `working-directory` and run `lint-command`, tolerating a
   non-zero exit code (ESLint exits 1 when it finds issues — we still need
   the report file it wrote).
2. Fail hard if `report-file` doesn't exist after the command runs.
3. Sum `errorCount`/`warningCount` across every entry in the report's JSON
   array (matches ESLint's `--format json` output shape).
4. Read `baseline-file` from the repo root and look up `.[baseline-key]`;
   default both counts to `0` if the file or key is missing.
5. Compute the verdict: `fail` if either count exceeds baseline, `improved`
   if either count is below baseline (and neither exceeds it), else `flat`.
6. On `fail`, print an `::error::` annotation and exit 1. On `improved`,
   print an `::notice::` annotation and exit 0.

## Common failure modes

- **Report file never gets written** — if `lint-command` crashes before
  producing output (e.g. a syntax error in the ESLint config itself, not a
  lint finding), the report file won't exist and the action fails with a
  clear `::error::` rather than silently reporting zero counts.
- **Baseline key typo** — a `baseline-key` that doesn't exist in
  `baseline-file` silently defaults to `0/0`, so any actual error/warning
  count will look like a regression. Double-check the key matches exactly.
- **`lint-command` needs shell features** (globs, `&&`, env expansion) — both
  scripts execute the command via the shell's own expression evaluator
  (`eval` in bash, `Invoke-Expression` in PowerShell), so quoting rules
  differ slightly between the two; test on both runner types if you rely on
  shell-specific syntax.
