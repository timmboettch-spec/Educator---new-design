<#
.SYNOPSIS
    Populate the outbound-mail sender domain (dev.curionn.com / qa.curionn.com /
    realityworks.com) with the SPF record Microsoft 365 / Graph sendMail
    requires, without clobbering any pre-existing SPF record on that domain.

.DESCRIPTION
    MailService (src/mail/mail.service.ts) sends via Microsoft Graph's
    /v1.0/users/{MAIL_FROM}/sendMail, authenticated as this app's managed
    identity (see AZURE_CLIENT_ID wiring in
    infra/modules/containerApp-backend.bicep). Receiving mail servers validate
    the envelope-from domain's SPF record against Microsoft 365's sending IPs
    (`include:spf.protection.outlook.com`) — without it, mail is likely to be
    marked spam or rejected outright.

    DNS for curionn.com / realityworks.com is managed via Porkbun (same
    provider already used for the backend's own custom-domain CNAME/TXT
    records — see Set-PorkbunDNSRecord in Deploy-Backend.ps1). Credentials are
    read from the shared `akv-all1-all` Key Vault (same vault this app already
    reads shared Microsoft Graph app-registration/Porkbun-adjacent secrets
    from), falling back to PORKBUN_API_KEY / PORKBUN_SECRET_KEY env vars.

    SPF ALLOWS EXACTLY ONE RECORD PER DOMAIN. A domain with more than one
    `v=spf1` TXT record (or one record but with a mechanism list that
    conflicts with ours) is invalid per RFC 7208 and receiving servers may
    apply "permerror" handling (from silent-drop to hard fail) — so this
    script:
      1. Reads existing TXT records for the target host.
      2. If zero SPF records exist  -> creates a fresh one, safe to apply.
      3. If exactly one SPF record exists and it already contains our
         required `include:` mechanism -> no-op.
      4. If exactly one SPF record exists WITHOUT our mechanism -> prints the
         existing record, the proposed MERGED record (inserting our
         `include:` before the terminal `all` qualifier), and refuses to
         write anything unless -Force is passed. This is the "conflicting
         domain record in SPF" case — it almost certainly means another
         sender (e.g. a marketing tool, another Azure app) already owns SPF
         for this host, and blindly overwriting would silently break that
         sender's deliverability.
      5. If MORE than one SPF record already exists -> the domain is already
         broken (RFC violation); refuses to touch it under any flag and asks
         for manual cleanup first.

    Dev is the only environment expected to be ready to apply today. Qa and
    prod run through the exact same logic (nothing is hardcoded to dev only)
    but this script defaults to a dry run (-WhatIf-style report, no writes)
    for every environment — pass -Apply to actually write records. Treat
    -Apply on qa/prod as gated: don't pass it until the qa.curionn.com /
    realityworks.com domains are confirmed ready for this change.

.PARAMETER Environment
    dev | qa | prod

.PARAMETER Apply
    Actually write the DNS record(s). Without it, the script only reports
    what it would do (current record, proposed record, conflict status) and
    exits without calling the Porkbun write APIs.

.PARAMETER Force
    Required in addition to -Apply to write a MERGED record over an existing
    single SPF record that doesn't yet contain our mechanism. Never required
    (and never bypasses) the "more than one existing SPF record" hard stop —
    that always requires manual cleanup first.

.PARAMETER PorkbunApiKey
.PARAMETER PorkbunSecretKey
    Optional explicit overrides. Normally sourced from the shared Key Vault
    (`akv-all1-all`, secrets `PORKBUN-API-KEY` / `PORKBUN-SECRET-KEY`) or the
    PORKBUN_API_KEY / PORKBUN_SECRET_KEY env vars.

.EXAMPLE
    # Report only — safe to run any time, writes nothing.
    .\scripts\Setup-MailDomain.ps1 -Environment dev

.EXAMPLE
    # Dev: no existing SPF record found by the report above -> apply it.
    .\scripts\Setup-MailDomain.ps1 -Environment dev -Apply

.EXAMPLE
    # Dev: report showed an existing SPF record needing a merge -> after
    # confirming the merge is safe for whoever else owns that record, apply it.
    .\scripts\Setup-MailDomain.ps1 -Environment dev -Apply -Force

.NOTES
    Qa/Prod: do NOT pass -Apply until the qa.curionn.com / realityworks.com
    sender domains are confirmed ready — this script does not gate that for
    you beyond requiring the flag explicitly, by design (see docs/DEPLOYMENT.md
    "Microsoft Graph mail").
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'qa', 'prod')]
    [string]$Environment,

    [switch]$Apply,
    [switch]$Force,

    [string]$PorkbunApiKey,
    [string]$PorkbunSecretKey
)

$ErrorActionPreference = 'Stop'

function Write-Step    { param([string]$Message) Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warn    { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Info    { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Gray }
function Write-Err     { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

# ---------- Per-environment sender domain -----------------------------------
# Matches infra/env/<env>.bicepparam's mailFrom + docs/ARCHITECTURE.md.
$domainMap = @{
    dev  = @{ Domain = 'curionn.com';      Host = 'dev' }
    qa   = @{ Domain = 'curionn.com';      Host = 'qa' }
    prod = @{ Domain = 'realityworks.com'; Host = '' }   # root domain, no subdomain
}
$target = $domainMap[$Environment]
$fqdn = if ($target.Host) { "$($target.Host).$($target.Domain)" } else { $target.Domain }

Write-Step "Sender domain for '$Environment': $fqdn"

# ---------- Porkbun credentials: shared Key Vault, then env var, then param -
$SharedVaultName = 'akv-all1-all'
$RequiredMechanism = 'include:spf.protection.outlook.com'
$BaseUrl = 'https://api.porkbun.com/api/json/v3'

function Get-PorkbunCredential {
    param([string]$SecretName, [string]$ExplicitValue, [string]$EnvVarName)

    if ($ExplicitValue) { return $ExplicitValue }
    $envValue = (Get-Item -Path "env:$EnvVarName" -ErrorAction SilentlyContinue).Value
    if ($envValue) { return $envValue }

    Write-Info "Reading '$SecretName' from Key Vault '$SharedVaultName'..."
    $value = az keyvault secret show --vault-name $SharedVaultName --name $SecretName --query value -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $value) {
        Write-Warn "Could not read '$SecretName' from '$SharedVaultName' (not found, or no access)."
        return $null
    }
    return $value
}

$script:ApiKey = Get-PorkbunCredential -SecretName 'PORKBUN-API-KEY' -ExplicitValue $PorkbunApiKey -EnvVarName 'PORKBUN_API_KEY'
$script:SecretKey = Get-PorkbunCredential -SecretName 'PORKBUN-SECRET-KEY' -ExplicitValue $PorkbunSecretKey -EnvVarName 'PORKBUN_SECRET_KEY'

if (-not $script:ApiKey -or -not $script:SecretKey) {
    throw "Porkbun credentials unavailable. Provide -PorkbunApiKey/-PorkbunSecretKey, set " +
          "PORKBUN_API_KEY/PORKBUN_SECRET_KEY, or seed 'PORKBUN-API-KEY'/'PORKBUN-SECRET-KEY' " +
          "in Key Vault '$SharedVaultName'."
}

function Invoke-PorkbunApi {
    <#
    Porkbun returns a real error body (status/message/code) even on 4xx/5xx —
    Invoke-RestMethod's terminating exception on those doesn't expose it by
    default, so this pulls it out of the exception's response instead of
    letting a caller's `catch` swallow the actual reason.
    #>
    param([string]$Path, [hashtable]$ExtraBody = @{})
    $body = (@{ secretapikey = $script:SecretKey; apikey = $script:ApiKey } + $ExtraBody) | ConvertTo-Json
    try {
        return Invoke-RestMethod -Uri "$BaseUrl/$Path" -Method Post -Body $body -ContentType 'application/json'
    } catch {
        $raw = $null
        if ($_.ErrorDetails.Message) { $raw = $_.ErrorDetails.Message }
        elseif ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $raw = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
            } catch { }
        }
        $parsed = $null
        if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { } }
        if ($parsed -and $parsed.message) {
            throw "Porkbun API error on $Path : $($parsed.message)"
        }
        throw
    }
}

function Get-ExistingTxtRecords {
    <#
    No silent "treat error as no records" here on purpose — a failed lookup
    (wrong domain, API access not opted in, auth failure, etc.) is NOT the
    same thing as "confirmed zero SPF records", and treating it that way
    would let the caller wrongly conclude it's safe to create a fresh record
    when it might not be. Callers should let this throw and stop.
    #>
    param([string]$Domain, [string]$Subdomain)
    $path = if ($Subdomain) { "dns/retrieveByNameType/$Domain/TXT/$Subdomain" } else { "dns/retrieveByNameType/$Domain/TXT" }
    $response = Invoke-PorkbunApi -Path $path
    if ($response.status -ne 'SUCCESS') {
        throw "Porkbun retrieveByNameType for $Domain/$Subdomain returned status '$($response.status)': $($response.message)"
    }
    return @($response.records)
}

# ---------- SPF conflict check -----------------------------------------------
Write-Step "Checking existing SPF record(s) for $fqdn"

$existingTxt = Get-ExistingTxtRecords -Domain $target.Domain -Subdomain $target.Host
$spfRecords = @($existingTxt | Where-Object { $_.content -match '^"?v=spf1' })

if ($spfRecords.Count -gt 1) {
    Write-Err "CONFLICT: $($spfRecords.Count) separate SPF (v=spf1) TXT records already exist for $fqdn."
    Write-Err "SPF permits exactly one record per domain — this is already an RFC 7208 violation."
    $spfRecords | ForEach-Object { Write-Err "  existing: $($_.content)" }
    Write-Err "Manual cleanup (consolidate to one record) is required before this script will touch $fqdn."
    exit 1
}

$desiredSpf = "v=spf1 $RequiredMechanism ~all"

if ($spfRecords.Count -eq 1) {
    $current = $spfRecords[0].content.Trim('"')
    if ($current -match [regex]::Escape($RequiredMechanism)) {
        Write-Success "Existing SPF record for $fqdn already includes '$RequiredMechanism' — nothing to do."
        Write-Info "  current: $current"
        exit 0
    }

    Write-Warn "CONFLICT: $fqdn already has an SPF record that does NOT include '$RequiredMechanism':"
    Write-Warn "  current record:  $current"
    $merged = if ($current -match '(-|~|\?)all\s*$') {
        $current -replace '\s*(-|~|\?)all\s*$', " $RequiredMechanism `$1all"
    } else {
        "$current $RequiredMechanism"
    }
    Write-Warn "  proposed record: $merged"
    Write-Warn "This almost certainly means another sender already owns SPF for $fqdn."
    Write-Warn "Confirm the merge above doesn't drop that sender's mechanism before applying."

    if (-not $Apply) {
        Write-Info "Dry run only (pass -Apply -Force to write the merged record above)."
        exit 0
    }
    if (-not $Force) {
        Write-Err "Refusing to overwrite an existing SPF record without -Force (see conflict above)."
        exit 1
    }

    Write-Step "Writing merged SPF record for $fqdn"
    Invoke-PorkbunApi -Path "dns/delete/$($target.Domain)/$($spfRecords[0].id)" | Out-Null
    $create = Invoke-PorkbunApi -Path "dns/create/$($target.Domain)" -ExtraBody @{ name = $target.Host; type = 'TXT'; content = $merged; ttl = '600' }
    if ($create.status -eq 'SUCCESS') {
        Write-Success "Merged SPF record written for $fqdn"
    } else {
        Write-Err "Porkbun API error: $($create.message)"
        exit 1
    }
    exit 0
}

# No existing SPF record — safe to create fresh.
Write-Info "No existing SPF record found for $fqdn."
Write-Info "  would create: $desiredSpf"

if (-not $Apply) {
    Write-Info "Dry run only (pass -Apply to write the record above)."
    exit 0
}

Write-Step "Writing SPF record for $fqdn"
$create = Invoke-PorkbunApi -Path "dns/create/$($target.Domain)" -ExtraBody @{ name = $target.Host; type = 'TXT'; content = $desiredSpf; ttl = '600' }
if ($create.status -eq 'SUCCESS') {
    Write-Success "SPF record created for $fqdn : $desiredSpf"
} else {
    Write-Err "Porkbun API error: $($create.message)"
    exit 1
}
