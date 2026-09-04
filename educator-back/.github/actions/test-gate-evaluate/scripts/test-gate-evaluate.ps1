#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

$failedCount = [int]$env:FAILED_COUNT
$alwaysStrictBranches = $env:ALWAYS_STRICT_BRANCHES -split '\s+' | Where-Object { $_ -ne '' }

$isAlwaysStrictBranch = $alwaysStrictBranches -contains $env:CURRENT_BRANCH

if ($failedCount -gt 0 -and ($env:STRICT_MODE -eq 'true' -or $isAlwaysStrictBranch)) {
    Write-Host "::error::$failedCount test(s) failed on branch '$($env:CURRENT_BRANCH)' with strict mode enforced - blocking the build"
    exit 1
} elseif ($failedCount -gt 0) {
    Write-Host "::warning::$failedCount test(s) failed on branch '$($env:CURRENT_BRANCH)' but strict mode is off - not blocking the build"
    exit 0
} else {
    Write-Host "All tests passed - test gate clear"
    exit 0
}
