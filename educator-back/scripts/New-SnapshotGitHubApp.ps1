<#
.SYNOPSIS
    Self-service creation of the snapshot GitHub App + prod provisioning,
    in one command.

.DESCRIPTION
    Automates everything in docs/SNAPSHOT-PROD-SETUP.md except the two
    unavoidable browser clicks (GitHub requires a human to confirm creating
    an App, and to confirm installing it — there's no pure-API path around
    either). Uses GitHub's "App manifest flow":

      1. Starts a local HTTP listener and opens your browser to a page that
         auto-submits the App manifest (name, permissions, redirect_url) to
         GitHub's "create app" endpoint for the given org.
      2. You click "Create GitHub App" on the page GitHub shows you.
      3. GitHub redirects back to the local listener with a one-time code;
         the script exchanges it for the App's credentials (ID + private
         key) via POST /app-manifests/{code}/conversions — no manual
         copy/pasting of an App ID or downloading a .pem by hand.
      4. Opens your browser again to the App's "install" page. You pick the
         org and select the snapshot repo, click "Install".
      5. Polls the GitHub API (as the App) until the installation shows up,
         then hands off to Provision-Snapshot-Prod.ps1 to actually
         provision prod.

    Run this as whoever owns/administers the Realityworks-AI org — creating
    an org-scoped GitHub App requires org admin rights.

.PARAMETER AppName
    GitHub App name. Must be globally unique across ALL of GitHub, not just
    the org — if creation fails with a name collision, rerun with a
    different -AppName (the browser page will show GitHub's error).

.PARAMETER Org
    GitHub org to create the App under. Default: Realityworks-AI.

.PARAMETER SnapshotRepo
    "owner/repo" of the private snapshot destination, used both as the
    App's homepage link context and to poll for the installation.

.PARAMETER Port
    Local port for the manifest-flow callback listener. Change only if this
    port is already in use on your machine.

.PARAMETER OutputKeyPath
    Where to save the App's downloaded private key. Default: ./snapshot-app-key.pem
    in the current directory. Delete it once provisioning succeeds — see
    docs/SNAPSHOT-PROD-SETUP.md.

.PARAMETER TeamsWebhookUrl
.PARAMETER TeamsMention
.PARAMETER ImageTag
.PARAMETER VerifyOnly
.PARAMETER DryRun
    Passed straight through to Provision-Snapshot-Prod.ps1 — see its help
    for details.

.PARAMETER SkipProvision
    Create the App and confirm installation, but don't call
    Provision-Snapshot-Prod.ps1 — just print the App ID + key path.

.EXAMPLE
    .\scripts\New-SnapshotGitHubApp.ps1

.EXAMPLE
    # Name collision on the default name — try a different one
    .\scripts\New-SnapshotGitHubApp.ps1 -AppName student-app-scenario-snapshot-bot-rwai

.NOTES
    Requires: pwsh 7+, a browser on the same machine you're running this on
    (or reachable via port-forward to localhost:$Port), org admin rights on
    the target org, Azure CLI logged in (only needed past the -SkipProvision
    point).
#>
[CmdletBinding()]
param(
    [string]$AppName = 'student-app-scenario-snapshot-bot',

    [string]$Org = 'Realityworks-AI',

    [string]$SnapshotRepo = 'Realityworks-AI/student-app-scenario-snapshot',

    [int]$Port = 51820,

    [string]$OutputKeyPath = './snapshot-app-key.pem',

    [string]$TeamsWebhookUrl = '',

    [string]$TeamsMention = '',

    [string]$ImageTag = 'placeholder',

    [switch]$VerifyOnly,

    [switch]$DryRun,

    [switch]$SkipProvision
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib/GitHubAppJwt.ps1')

function Open-Browser([string]$Url) {
    try {
        if ($IsWindows) {
            Start-Process $Url
        } elseif ($IsMacOS) {
            Start-Process 'open' -ArgumentList $Url
        } else {
            Start-Process 'xdg-open' -ArgumentList $Url
        }
    } catch {
        Write-Host "  Couldn't open a browser automatically — open this URL yourself:" -ForegroundColor Yellow
        Write-Host "  $Url"
    }
}

$redirectUrl = "http://localhost:$Port/callback"

$manifest = @{
    name                = $AppName
    url                 = "https://github.com/$SnapshotRepo"
    redirect_url        = $redirectUrl
    public              = $false
    # pull_requests is needed alongside contents: the job lands each run's
    # changes via branch + PR + squash-merge (see docs/WEEKLY-SNAPSHOT.md),
    # not a direct push. Requesting both up front on a brand-new App avoids
    # the org re-approval step that adding a permission to an *existing*
    # installed App requires.
    default_permissions = @{ contents = 'write'; pull_requests = 'write' }
    default_events      = @()
    hook_attributes     = @{ active = $false }
} | ConvertTo-Json -Compress

$manifestEncoded = [System.Net.WebUtility]::HtmlEncode($manifest)
$createUrl = "https://github.com/organizations/$Org/settings/apps/new"

$submitPageHtml = @"
<!doctype html>
<html><body onload="document.forms[0].submit()">
  <p>Redirecting to GitHub to create the App&hellip;</p>
  <form action="$createUrl" method="post">
    <input type="hidden" name="manifest" value="$manifestEncoded" />
  </form>
</body></html>
"@

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "==> Local listener started on http://localhost:$Port" -ForegroundColor Cyan
Write-Host "==> Opening your browser to create GitHub App '$AppName' under $Org" -ForegroundColor Cyan
Write-Host "    (click 'Create GitHub App' on the page GitHub shows you)"
Open-Browser "http://localhost:$Port/"

$code = $null
try {
    while (-not $code) {
        $context = $listener.GetContext()
        $req  = $context.Request
        $resp = $context.Response

        if ($req.Url.AbsolutePath -eq '/callback') {
            $code = $req.QueryString['code']
            $body = [System.Text.Encoding]::UTF8.GetBytes('<html><body>App created — you can close this tab and go back to the terminal.</body></html>')
        } else {
            $body = [System.Text.Encoding]::UTF8.GetBytes($submitPageHtml)
        }
        $resp.ContentType = 'text/html'
        $resp.ContentLength64 = $body.Length
        $resp.OutputStream.Write($body, 0, $body.Length)
        $resp.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}

if (-not $code) {
    throw "No manifest code received on the callback — did GitHub show an error (e.g. app name already taken)? Rerun with a different -AppName."
}

Write-Host "==> Exchanging manifest code for App credentials" -ForegroundColor Cyan
$app = Invoke-RestMethod `
    -Uri "https://api.github.com/app-manifests/$code/conversions" `
    -Headers @{ Accept = 'application/vnd.github+json' } `
    -Method Post

Set-Content -Path $OutputKeyPath -Value $app.pem -NoNewline
Write-Host "  Created App '$($app.name)' (ID $($app.id), slug $($app.slug))" -ForegroundColor Green
Write-Host "  Private key saved to $OutputKeyPath" -ForegroundColor Green

$installUrl = "https://github.com/apps/$($app.slug)/installations/new"
Write-Host "==> Opening your browser to install the App" -ForegroundColor Cyan
Write-Host "    Pick '$Org', 'Only select repositories', choose the snapshot repo, click Install."
Open-Browser $installUrl

Write-Host "==> Waiting for the installation on $SnapshotRepo (checking every 5s, up to 2 minutes)" -ForegroundColor Cyan
$installationId = $null
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Seconds 5
    try {
        $installationId = Resolve-GitHubAppInstallationId -AppId $app.id -PrivateKeyPem $app.pem -Repo $SnapshotRepo
        if ($installationId) { break }
    } catch {
        # Not installed yet — keep polling.
    }
}

if (-not $installationId) {
    Write-Host "==> Didn't see the installation land within 2 minutes." -ForegroundColor Yellow
    Write-Host "    Once you've clicked Install, run:"
    Write-Host "    pwsh ./scripts/Provision-Snapshot-Prod.ps1 -GitAppId $($app.id) -GitAppPrivateKeyPath $OutputKeyPath"
    exit 1
}

Write-Host "  Installed — installation ID $installationId" -ForegroundColor Green

if ($SkipProvision) {
    Write-Host "==> -SkipProvision set. App ID: $($app.id)  Key: $OutputKeyPath  Installation ID: $installationId" -ForegroundColor Yellow
    exit 0
}

$provisionArgs = @{
    GitAppId              = "$($app.id)"
    GitAppPrivateKeyPath  = $OutputKeyPath
    GitAppInstallationId  = $installationId
    SnapshotRepo          = $SnapshotRepo
    TeamsWebhookUrl       = $TeamsWebhookUrl
    TeamsMention          = $TeamsMention
    ImageTag              = $ImageTag
    VerifyOnly            = $VerifyOnly
    DryRun                = $DryRun
}
& (Join-Path $PSScriptRoot 'Provision-Snapshot-Prod.ps1') @provisionArgs
