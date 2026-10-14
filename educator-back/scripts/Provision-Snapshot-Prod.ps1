<#
.SYNOPSIS
    One-shot local provisioning of the weekly snapshot-to-git job for prod.

.DESCRIPTION
    Wraps the manual "set six SNAPSHOT_* env vars, then run Provision-Bicep.ps1"
    steps from docs/WEEKLY-SNAPSHOT.md into a single command. Only ever targets
    prod — the job is prod-only by convention (see docs/WEEKLY-SNAPSHOT.md).

    If -GitAppInstallationId is omitted, it's resolved automatically: the
    script builds a short-lived App JWT from the private key (RS256, signed
    in-process via .NET's RSA class — no openssl dependency) and calls
    `GET /repos/{SnapshotRepo}/installation` as that JWT. This only works if
    the App has already been installed on the target repo.

    Don't have a GitHub App yet? Run New-SnapshotGitHubApp.ps1 first — it
    creates the App via GitHub's manifest flow (two browser clicks, no
    manual form-filling) and hands off to this script automatically. This
    script is still useful standalone for re-provisioning (key rotation,
    adding a Teams webhook) once the App already exists.

.PARAMETER GitAppId
    The GitHub App's numeric App ID (Settings -> Developer settings -> GitHub
    Apps -> your app -> "App ID" near the top). Not secret.

.PARAMETER GitAppPrivateKeyPath
    Path to the App's private key .pem file, downloaded once from the App's
    settings page ("Generate a private key"). Read into memory, set as
    SNAPSHOT_GIT_APP_PRIVATE_KEY, and never written back to disk by this
    script.

.PARAMETER SnapshotRepo
    "owner/repo" of the private snapshot destination. Defaults to
    Realityworks-AI/student-app-scenario-snapshot.

.PARAMETER GitAppInstallationId
    The App's installation ID on SnapshotRepo. Optional — auto-resolved via
    the GitHub API if omitted (requires the App to already be installed).

.PARAMETER TeamsWebhookUrl
    Optional Teams incoming-webhook URL for push/failure notifications. Leave
    unset to run without notifications (default).

.PARAMETER ImageTag
    Snapshot job image tag. Defaults to 'placeholder' (dormant image) until
    build-snapshot-image.yml has pushed a real one.

.PARAMETER VerifyOnly
    Resolve (or validate) the installation ID and confirm the App can mint an
    installation access token, then exit WITHOUT provisioning anything.

.PARAMETER DryRun
    Print the resolved env vars (private key masked) and exit without calling
    Provision-Bicep.ps1.

.EXAMPLE
    # Full provision, installation ID auto-resolved
    .\scripts\Provision-Snapshot-Prod.ps1 -GitAppId 123456 -GitAppPrivateKeyPath .\snapshot-app-key.pem

.EXAMPLE
    # Just confirm the App/installation is wired up correctly first
    .\scripts\Provision-Snapshot-Prod.ps1 -GitAppId 123456 -GitAppPrivateKeyPath .\snapshot-app-key.pem -VerifyOnly

.EXAMPLE
    # Turn on Teams notifications too
    .\scripts\Provision-Snapshot-Prod.ps1 -GitAppId 123456 -GitAppPrivateKeyPath .\snapshot-app-key.pem -TeamsWebhookUrl 'https://...'

.NOTES
    Requires: pwsh 7+, Azure CLI logged in with access to ARG-prod1-rwai
    (only needed for the actual provision, not -VerifyOnly/-DryRun).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$GitAppId,

    [Parameter(Mandatory)]
    [string]$GitAppPrivateKeyPath,

    [string]$SnapshotRepo = 'Realityworks-AI/student-app-scenario-snapshot',

    [string]$GitAppInstallationId,

    [string]$TeamsWebhookUrl = '',

    [string]$TeamsMention = '',

    [string]$ImageTag = 'placeholder',

    [switch]$VerifyOnly,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib/GitHubAppJwt.ps1')

if (-not (Test-Path $GitAppPrivateKeyPath)) {
    throw "Private key file not found: $GitAppPrivateKeyPath"
}
$privateKeyPem = Get-Content -Raw -Path $GitAppPrivateKeyPath

if (-not $GitAppInstallationId) {
    Write-Host "==> No -GitAppInstallationId given, resolving via GET /repos/$SnapshotRepo/installation" -ForegroundColor Cyan
    $GitAppInstallationId = Resolve-GitHubAppInstallationId -AppId $GitAppId -PrivateKeyPem $privateKeyPem -Repo $SnapshotRepo
    Write-Host "  Resolved installation ID: $GitAppInstallationId" -ForegroundColor Green
} else {
    Write-Host "==> Using supplied installation ID: $GitAppInstallationId" -ForegroundColor Cyan
}

Write-Host "==> Verifying the App can mint an installation access token" -ForegroundColor Cyan
try {
    $tokenResp = Test-GitHubAppInstallationToken -AppId $GitAppId -PrivateKeyPem $privateKeyPem -InstallationId $GitAppInstallationId
    Write-Host "  OK — installation token minted, expires $($tokenResp.expires_at)" -ForegroundColor Green
} catch {
    throw "Failed to mint an installation access token for installation $GitAppInstallationId. Check that the App is installed on $SnapshotRepo with 'Contents: Read & write' permission. Underlying error: $($_.Exception.Message)"
}

if ($VerifyOnly) {
    Write-Host "==> -VerifyOnly set, exiting without provisioning." -ForegroundColor Yellow
    exit 0
}

$env:SNAPSHOT_REPO                     = $SnapshotRepo
$env:SNAPSHOT_GIT_APP_ID                = $GitAppId
$env:SNAPSHOT_GIT_APP_INSTALLATION_ID   = $GitAppInstallationId
$env:SNAPSHOT_GIT_APP_PRIVATE_KEY       = $privateKeyPem
$env:SNAPSHOT_IMAGE_TAG                 = $ImageTag
$env:SNAPSHOT_TEAMS_WEBHOOK_URL         = $TeamsWebhookUrl
$env:SNAPSHOT_TEAMS_MENTION             = $TeamsMention

Write-Host "==> Resolved snapshot env vars" -ForegroundColor Cyan
Write-Host "  SNAPSHOT_REPO                   = $SnapshotRepo"
Write-Host "  SNAPSHOT_GIT_APP_ID              = $GitAppId"
Write-Host "  SNAPSHOT_GIT_APP_INSTALLATION_ID = $GitAppInstallationId"
Write-Host "  SNAPSHOT_GIT_APP_PRIVATE_KEY     = <redacted, $($privateKeyPem.Length) chars>"
Write-Host "  SNAPSHOT_IMAGE_TAG               = $ImageTag"
Write-Host "  SNAPSHOT_TEAMS_WEBHOOK_URL       = $(if ($TeamsWebhookUrl) { '<set>' } else { '<empty>' })"
Write-Host "  SNAPSHOT_TEAMS_MENTION           = $(if ($TeamsMention) { $TeamsMention } else { '<empty>' })"

if ($DryRun) {
    Write-Host "==> -DryRun set, not calling Provision-Bicep.ps1." -ForegroundColor Yellow
    exit 0
}

Write-Host "==> Calling Provision-Bicep.ps1 -Environment prod" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'Provision-Bicep.ps1') -Environment prod

Write-Host "==> Done. Trigger the job once to confirm before waiting for Thursday:" -ForegroundColor Green
Write-Host "    az containerapp job start -n job-prod1-rwai-edusnap -g ARG-prod1-rwai"
Write-Host "    (or run the 'Trigger Snapshot Job (prod)' GitHub Actions workflow)"
