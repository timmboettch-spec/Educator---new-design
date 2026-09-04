<#
.SYNOPSIS
    One-time setup: lets preview-deploy.yml's cleanup-preview job authenticate to
    Azure via OIDC (azure/login) so it can call `az staticwebapp environment
    delete` directly.

.DESCRIPTION
    Azure/static-web-apps-deploy's `action: close` does not reliably delete
    named environments created outside a pull_request event (confirmed via
    Microsoft's own docs and multiple unresolved Azure/static-web-apps GitHub
    issues) — this repo's previews deploy on plain branch pushes, not PRs, so
    `close` silently no-ops ("No matching Static Web App environment was
    found") instead of actually deleting the preview.

    Reuses the existing sp-Crexo-Educator-Frontend-dev App Registration
    (appId 7d6489e4-2725-430e-b335-c3a03e3d68ff), which already has
    Contributor on the ARG-dev1-rwai resource group (covers
    swa-dev1-rwai-edufront) — this only adds a federated credential scoped to
    THIS repo's `dev` GH Environment. It does not touch the SP's existing
    roles or its other federated credentials (e.g. the Crexo-Educator-Frontend
    one).

.NOTES
    Requires: az CLI logged in with rights to manage this App Registration's
    federated credentials, and gh CLI authenticated with admin access to set
    repo secrets on Realityworks-AI/Educator-App-Realityworks.

.EXAMPLE
    ./Setup-PreviewCleanupOidc.ps1
#>

$ErrorActionPreference = 'Stop'

$AppId = '7d6489e4-2725-430e-b335-c3a03e3d68ff'
$Repo = 'Realityworks-AI/Educator-App-Realityworks'
$FedCredName = 'gh-educator-app-realityworks-dev'
$Subject = "repo:${Repo}:environment:dev"

Write-Host "== Checking for an existing federated credential named $FedCredName =="
$existing = az ad app federated-credential list --id $AppId --query "[?name=='$FedCredName'].id" -o tsv

if ($existing) {
    Write-Host "Federated credential '$FedCredName' already exists (id: $existing) — skipping create."
} else {
    Write-Host "== Creating federated credential (subject: $Subject) =="
    $params = @{
        name        = $FedCredName
        issuer      = 'https://token.actions.githubusercontent.com'
        subject     = $Subject
        audiences   = @('api://AzureADTokenExchange')
        description = "OIDC for $Repo preview-deploy.yml cleanup-preview job (environment: dev)"
    } | ConvertTo-Json -Compress

    az ad app federated-credential create --id $AppId --parameters $params
}

$tenantId = az account show --query tenantId -o tsv
$subscriptionId = az account show --query id -o tsv

Write-Host ""
Write-Host "== Existing role assignments on $AppId (informational — not modified by this script) =="
az role assignment list --assignee $AppId --all --query "[].{role:roleDefinitionName, scope:scope}" -o table

Write-Host ""
Write-Host "== Setting GitHub secrets on $Repo (matches Educator-App-Backend's naming convention) =="
gh secret set AZURE_CLIENT_ID       --repo $Repo --body $AppId
gh secret set AZURE_TENANT_ID       --repo $Repo --body $tenantId
gh secret set AZURE_SUBSCRIPTION_ID --repo $Repo --body $subscriptionId

Write-Host ""
Write-Host "Done. AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_SUBSCRIPTION_ID are set on $Repo."
Write-Host "Next: update cleanup-preview in .github/workflows/preview-deploy.yml to use"
Write-Host "azure/login (OIDC) + 'az staticwebapp environment delete' instead of the"
Write-Host "deploy-swa 'close' action, and add 'id-token: write' to the workflow's"
Write-Host "top-level permissions block."
