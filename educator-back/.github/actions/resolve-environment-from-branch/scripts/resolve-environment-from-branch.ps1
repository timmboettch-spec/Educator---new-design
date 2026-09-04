#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

$environment = $null

if ($env:EVENT_NAME -eq 'workflow_dispatch') {
    $environment = $env:DISPATCH_ENVIRONMENT_INPUT
} else {
    $branch = $env:REF -replace '^refs/heads/', ''

    $branchMap = $env:BRANCH_ENVIRONMENT_MAP | ConvertFrom-Json

    # Exact match first.
    if ($branchMap.PSObject.Properties.Name -contains $branch) {
        $environment = $branchMap.$branch
    }

    # Fall back to a "prefix/*" wildcard-style key, matched via a simple
    # string prefix check (not full glob).
    if ([string]::IsNullOrEmpty($environment)) {
        foreach ($prop in $branchMap.PSObject.Properties) {
            if ($prop.Name.EndsWith('/*')) {
                $prefix = $prop.Name.Substring(0, $prop.Name.Length - 1)
                if ($branch.StartsWith($prefix)) {
                    $environment = $prop.Value
                    break
                }
            }
        }
    }
}

if ([string]::IsNullOrEmpty($environment)) {
    Write-Host "::error::Unknown branch for deployment"
    exit 1
}

$prefix = $env:DEFAULT_PREFIX
if ($env:ENV_PREFIX_MAP) {
    $prefixMap = $env:ENV_PREFIX_MAP | ConvertFrom-Json
    if ($prefixMap.PSObject.Properties.Name -contains $environment) {
        $override = $prefixMap.$environment
        if (-not [string]::IsNullOrEmpty($override)) {
            $prefix = $override
        }
    }
}

$resourceGroup = "ARG-$environment$($env:AZ_VERSION)-$prefix"
$keyVault = "akv$environment$($env:AZ_VERSION)$prefix"
$storageAccount = "asa$environment$($env:AZ_VERSION)$prefix"

"environment=$environment"           | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"prefix=$prefix"                     | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"resource-group=$resourceGroup"      | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"key-vault=$keyVault"                | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
"storage-account=$storageAccount"    | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8

Write-Host "Resolved environment=$environment prefix=$prefix resource-group=$resourceGroup"
