<#
.SYNOPSIS
    Re-provision backend infrastructure via main.bicep, preserving custom domain
    + managed cert binding across runs.

.DESCRIPTION
    main.bicep / containerApp-backend.bicep set the ACA `customDomains` array
    from the `backendCustomDomain` and `backendCustomDomainCertificateId`
    parameters. If both are empty (the bicepparam defaults), the array is set
    to null and any previously-bound custom domain is REMOVED.

    The CI fast-path (app-deploy.bicep) avoids this by reading the live binding
    and passing it through. Full re-provisions via `az deployment sub create`
    do NOT — so this wrapper does the same fetch + export, then invokes the
    deployment.

    Idempotent. First-provision (no ACA yet) leaves the env vars empty and
    proceeds as before.

.PARAMETER Environment
    dev | qa | prod

.PARAMETER DeploymentName
    Override the az deployment name. Defaults to a timestamped value.

.EXAMPLE
    # Pass DB password (and other secrets) via env vars first, then:
    .\scripts\Provision-Bicep.ps1 -Environment dev

.NOTES
    Required env vars (read by *.bicepparam): IMAGE_TAG, POSTGRES_ADMIN_PASSWORD,
    JWT_SECRET, GRAPH_CLIENT_SECRET, AZURE_STORAGE_CONNECTION_STRING,
    GRAPH_TENANT_ID, GRAPH_CLIENT_ID, LTI_FALLBACK_KEY_ID,
    LTI_FALLBACK_PRIVATE_KEY_PEM. Empty values preserve existing KV secrets.

    This script ALSO sets BACKEND_CUSTOM_DOMAIN and BACKEND_CUSTOM_DOMAIN_CERT_ID
    based on the live ACA so re-provisions never wipe the binding.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'qa', 'prod')]
    [string]$Environment,

    [string]$DeploymentName
)

$ErrorActionPreference = 'Stop'

$prefix       = 'rwai'
$app          = 'edu'
$azureVersion = '1'

$rg            = "ARG-$Environment$azureVersion-$prefix"
$backendAcaName = "aca-$Environment$azureVersion-$prefix-${app}back"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$template = Join-Path $repoRoot 'infra/main.bicep'
$paramFile = Join-Path $repoRoot "infra/env/$Environment.bicepparam"

if (-not (Test-Path $template))  { throw "Template not found: $template" }
if (-not (Test-Path $paramFile)) { throw "Param file not found: $paramFile" }

if (-not $DeploymentName) {
    $DeploymentName = "edu-back-$Environment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}

Write-Host "==> Fetching live custom domain binding from $backendAcaName ($rg)" -ForegroundColor Cyan
$existingDomain = az containerapp show -n $backendAcaName -g $rg `
    --query "properties.configuration.ingress.customDomains[0].name" -o tsv 2>$null
$existingCertId = az containerapp show -n $backendAcaName -g $rg `
    --query "properties.configuration.ingress.customDomains[0].certificateId" -o tsv 2>$null

if ($existingDomain -and $existingCertId) {
    Write-Host "  customDomain  = $existingDomain" -ForegroundColor Green
    Write-Host "  certificateId = $existingCertId" -ForegroundColor Green
    $env:BACKEND_CUSTOM_DOMAIN         = $existingDomain
    $env:BACKEND_CUSTOM_DOMAIN_CERT_ID = $existingCertId
} else {
    Write-Host "  No existing binding (first provision or unbound). Proceeding without override." -ForegroundColor Yellow
    $env:BACKEND_CUSTOM_DOMAIN         = ''
    $env:BACKEND_CUSTOM_DOMAIN_CERT_ID = ''
}

Write-Host "==> Running az deployment sub create" -ForegroundColor Cyan
Write-Host "    template:   $template"
Write-Host "    parameters: $paramFile"
Write-Host "    name:       $DeploymentName"

az deployment sub create `
    --location eastus `
    --template-file $template `
    --parameters $paramFile `
    --name $DeploymentName

if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed (exit code $LASTEXITCODE)"
}

Write-Host "==> Deployment succeeded: $DeploymentName" -ForegroundColor Green
