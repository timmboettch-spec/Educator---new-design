#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

$repoRoot = Get-Location

# Run the lint command from working-directory. Lint tools commonly exit
# non-zero when they find issues, but we still need the report file, so this
# step must not fail the build on the command's own exit code.
Push-Location $env:WORKING_DIRECTORY
try {
    Invoke-Expression $env:LINT_COMMAND
} catch {
    # swallow — lint tools exit non-zero on findings, we only care about the report file
} finally {
    Pop-Location
}

$reportPath = Join-Path $env:WORKING_DIRECTORY $env:REPORT_FILE

if (-not (Test-Path $reportPath)) {
    Write-Host "::error::Lint report file not found at $reportPath"
    exit 1
}

$report = Get-Content $reportPath -Raw | ConvertFrom-Json
$errors = 0
$warnings = 0
foreach ($file in $report) {
    if ($null -ne $file.errorCount) { $errors += $file.errorCount }
    if ($null -ne $file.warningCount) { $warnings += $file.warningCount }
}

$baselineErrors = 0
$baselineWarnings = 0
$baselinePath = Join-Path $repoRoot $env:BASELINE_FILE
if (Test-Path $baselinePath) {
    $baseline = Get-Content $baselinePath -Raw | ConvertFrom-Json
    $entry = $baseline.($env:BASELINE_KEY)
    if ($null -ne $entry) {
        if ($null -ne $entry.errors) { $baselineErrors = $entry.errors }
        if ($null -ne $entry.warnings) { $baselineWarnings = $entry.warnings }
    }
}

"errors=$errors"                       | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"warnings=$warnings"                   | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"baseline-errors=$baselineErrors"      | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"baseline-warnings=$baselineWarnings"  | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8

Write-Host "Lint: errors=$errors (baseline $baselineErrors), warnings=$warnings (baseline $baselineWarnings)"

if ($errors -gt $baselineErrors -or $warnings -gt $baselineWarnings) {
    "verdict=fail" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    Write-Host "::error::Lint regressed against baseline '$($env:BASELINE_KEY)' (errors: $errors/$baselineErrors, warnings: $warnings/$baselineWarnings)"
    exit 1
} elseif ($errors -lt $baselineErrors -or $warnings -lt $baselineWarnings) {
    "verdict=improved" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    Write-Host "::notice::Lint improved against baseline '$($env:BASELINE_KEY)' (errors: $errors/$baselineErrors, warnings: $warnings/$baselineWarnings) - consider lowering the baseline"
} else {
    "verdict=flat" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}
