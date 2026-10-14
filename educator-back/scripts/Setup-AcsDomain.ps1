<#
.SYNOPSIS
    Populate the DNS records Azure Communication Services requires to verify
    a CustomerManaged Email domain (dev.curionn.com / qa.curionn.com /
    realityworks.com), and kick off verification for each record type.

.DESCRIPTION
    infra/modules/acsEmail.bicep provisions the Communication Services +
    Email Communication Service + Domain resources with domainManagement =
    'CustomerManaged'. That domain resource starts life 'Unverified' — Azure
    computes the actual DNS records it needs (a domain-ownership TXT record,
    an SPF TXT record with an ACS-specific `include:` mechanism, and two DKIM
    CNAME records) only once the resource exists, so they can't be hardcoded
    in Bicep. This script reads them back via `az communication email domain
    show` and writes them via the Porkbun API (same provider/pattern as
    scripts/Setup-MailDomain.ps1 and Set-PorkbunDNSRecord in
    Deploy-Backend.ps1), then calls `az communication email domain
    initiate-verification` for each record type.

    SPF conflict: this app's Graph/M365 mail setup (scripts/Setup-MailDomain.ps1)
    already wrote `v=spf1 include:spf.protection.outlook.com ~all` for these
    same domains. SPF permits exactly one `v=spf1` TXT record per domain, and
    ACS's required SPF record needs its own `include:` mechanism, so the SPF
    record specifically must be MERGED (not blindly overwritten and not left
    as a second TXT record) — this reuses the same
    read-existing/detect-conflict/print-proposed-merge/require--Force logic
    as Setup-MailDomain.ps1, rather than Deploy-Backend.ps1's
    Set-PorkbunDNSRecord (which deletes ALL existing records at a given
    name+type before creating the new one — safe for the DKIM CNAMEs and the
    domain-verification TXT below, since nothing else already lives at those
    names, but wrong for SPF).

    The DKIM CNAME records and the domain-verification TXT record are plain
    creates (checked for an exact-match existing record first, to stay
    idempotent across repeated dry-runs / re-applies) — nothing else is
    expected to already occupy those specific record names.

    Dev is the only environment expected to be ready to apply today. Qa/prod
    run through the exact same logic but this script defaults to a dry run
    for every environment — pass -Apply to actually write records.

.PARAMETER Environment
    dev | qa | prod

.PARAMETER Apply
    Actually write the DNS record(s) and call initiate-verification. Without
    it, the script only reports what it would do and exits without writing.

.PARAMETER Force
    Required in addition to -Apply to write a MERGED SPF record over the
    existing Graph/M365 SPF record. Never required (and never bypasses) the
    "more than one existing SPF record" hard stop.

.PARAMETER PorkbunApiKey
.PARAMETER PorkbunSecretKey
    Optional explicit overrides. Normally sourced from the shared Key Vault
    (`akv-all1-all`, secrets `PORKBUN-API-KEY` / `PORKBUN-SECRET-KEY`) or the
    PORKBUN_API_KEY / PORKBUN_SECRET_KEY env vars.

.EXAMPLE
    # Report only — safe to run any time, writes nothing.
    .\scripts\Setup-AcsDomain.ps1 -Environment dev

.EXAMPLE
    # After reviewing the report above.
    .\scripts\Setup-AcsDomain.ps1 -Environment dev -Apply -Force

.NOTES
    Requires the `communication` az CLI extension (auto-installs on first use)
    and that infra/modules/acsEmail.bicep has already been deployed for this
    environment — the Domains resource must exist before this script can read
    its verification records. See docs/DEPLOYMENT.md "Azure Communication
    Services mail".
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

# ---------- Per-environment resource names / sender domain ------------------
# Matches infra/modules/acsEmail.bicep's naming + infra/env/<env>.bicepparam's
# mailFrom.
$domainMap = @{
    dev  = @{ Domain = 'curionn.com';      Host = 'dev.rwai' }
    qa   = @{ Domain = 'curionn.com';      Host = 'qa.rwai' }
    prod = @{ Domain = 'realityworks.com'; Host = '' }
}
$rgMap = @{ dev = 'ARG-dev1-rwai'; qa = 'ARG-qa1-rwai'; prod = 'ARG-prod1-rwai' }
$target = $domainMap[$Environment]
$fqdn = if ($target.Host) { "$($target.Host).$($target.Domain)" } else { $target.Domain }
$resourceGroup = $rgMap[$Environment]
$emailServiceName = "acs-$Environment-rwai-edu-mail"

Write-Step "ACS Email domain for '$Environment': $fqdn (rg $resourceGroup, email service $emailServiceName)"

# ---------- Read the domain's required verification records from Azure -----
Write-Step "Reading verification records from the Domains resource"

$domainJson = az communication email domain show `
    --domain-name $fqdn --email-service-name $emailServiceName -g $resourceGroup `
    -o json 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Could not read Domains resource '$fqdn' under '$emailServiceName' in '$resourceGroup' — " +
          "has infra/modules/acsEmail.bicep been deployed for '$Environment' yet?"
}
# `az` emits its preview-extension warning on stderr, which the 2>$null above
# discards — $domainJson is now pure JSON on stdout only.
$domainInfo = ($domainJson -join "`n") | ConvertFrom-Json
$records = $domainInfo.verificationRecords
$states = $domainInfo.verificationStates

if (-not $records) {
    throw "Domains resource '$fqdn' returned no verificationRecords — unexpected shape, inspect manually: $domainJson"
}

Write-Info "Current verification states:"
$states.PSObject.Properties | ForEach-Object { Write-Info "  $($_.Name): $($_.Value.status)" }

# ---------- Porkbun credentials: shared Key Vault, then env var, then param -
$SharedVaultName = 'akv-all1-all'
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

function Get-ExistingRecords {
    param([string]$Domain, [string]$Type, [string]$Subdomain)
    $path = if ($Subdomain) { "dns/retrieveByNameType/$Domain/$Type/$Subdomain" } else { "dns/retrieveByNameType/$Domain/$Type" }
    $response = Invoke-PorkbunApi -Path $path
    if ($response.status -ne 'SUCCESS') {
        throw "Porkbun retrieveByNameType for $Domain/$Type/$Subdomain returned status '$($response.status)': $($response.message)"
    }
    return @($response.records)
}

# `name` on each verificationRecords entry is the FQDN Azure wants the record
# on (e.g. 'dev.curionn.com' for SPF/Domain, 'selector1-azurecomm-prod-net._domainkey.dev.curionn.com'
# for DKIM) — derive the Porkbun subdomain by stripping the base $target.Domain.
function Get-PorkbunSubdomain {
    <#
    ACS is inconsistent about whether `verificationRecords.<Key>.name` is a
    full FQDN or a bare label: Domain/SPF come back as the full sender
    domain (e.g. 'dev.curionn.com'), but DKIM/DKIM2 come back as just the
    selector label relative to the sender domain's own zone apex (e.g.
    'selector1-azurecomm-prod-net._domainkey', NOT
    '...​.dev.curionn.com') — confirmed against a live dev deploy.
    #>
    param([string]$RecordFqdn)
    $suffix = ".$($target.Domain)"
    if ($RecordFqdn -eq $target.Domain) { return '' }
    if ($RecordFqdn.EndsWith($suffix)) { return $RecordFqdn.Substring(0, $RecordFqdn.Length - $suffix.Length) }
    if ($RecordFqdn -eq $fqdn) { return $target.Host }
    if ($RecordFqdn.EndsWith(".$fqdn")) {
        $label = $RecordFqdn.Substring(0, $RecordFqdn.Length - ".$fqdn".Length)
        return $target.Host ? "$label.$($target.Host)" : $label
    }
    # Bare label relative to the sender domain's zone apex (the DKIM case).
    return $target.Host ? "$RecordFqdn.$($target.Host)" : $RecordFqdn
}

$anyChanges = $false

# ---------- SPF: merge-aware (conflicts with the existing Graph SPF record) -
$spfRecord = $records.SPF
if ($spfRecord) {
    Write-Step "SPF record ($($spfRecord.type) $($spfRecord.name))"
    $spfSubdomain = Get-PorkbunSubdomain -RecordFqdn $spfRecord.name
    $existingTxt = Get-ExistingRecords -Domain $target.Domain -Type 'TXT' -Subdomain $spfSubdomain
    $existingSpf = @($existingTxt | Where-Object { $_.content -match '^"?v=spf1' })

    if ($existingSpf.Count -gt 1) {
        Write-Err "CONFLICT: $($existingSpf.Count) separate SPF records already exist at $($spfRecord.name) — RFC 7208 violation, manual cleanup required first."
        exit 1
    }

    $desiredMechanism = $spfRecord.value -replace '^v=spf1\s+', '' -replace '\s+[-~?]all\s*$', ''

    if ($existingSpf.Count -eq 1) {
        $current = $existingSpf[0].content.Trim('"')
        if ($current -match [regex]::Escape($desiredMechanism)) {
            Write-Success "Existing SPF record already includes '$desiredMechanism' — nothing to do."
        } else {
            Write-Warn "CONFLICT: existing SPF record does not include ACS's required mechanism:"
            Write-Warn "  current record:  $current"
            $merged = if ($current -match '(-|~|\?)all\s*$') {
                $current -replace '\s*(-|~|\?)all\s*$', " $desiredMechanism `$1all"
            } else {
                "$current $desiredMechanism"
            }
            Write-Warn "  proposed record: $merged"
            $anyChanges = $true
            if ($Apply -and $Force) {
                Write-Step "Writing merged SPF record"
                Invoke-PorkbunApi -Path "dns/delete/$($target.Domain)/$($existingSpf[0].id)" | Out-Null
                $create = Invoke-PorkbunApi -Path "dns/create/$($target.Domain)" -ExtraBody @{ name = $spfSubdomain; type = 'TXT'; content = $merged; ttl = '600' }
                if ($create.status -eq 'SUCCESS') { Write-Success "Merged SPF record written." } else { Write-Err "Porkbun API error: $($create.message)"; exit 1 }
            } elseif ($Apply) {
                Write-Err "Refusing to overwrite the existing SPF record without -Force."
                exit 1
            } else {
                Write-Info "Dry run only (pass -Apply -Force to write the merged record above)."
            }
        }
    } else {
        Write-Info "No existing SPF record at $($spfRecord.name) — would create: $($spfRecord.value)"
        $anyChanges = $true
        if ($Apply) {
            $create = Invoke-PorkbunApi -Path "dns/create/$($target.Domain)" -ExtraBody @{ name = $spfSubdomain; type = 'TXT'; content = $spfRecord.value; ttl = '600' }
            if ($create.status -eq 'SUCCESS') { Write-Success "SPF record created." } else { Write-Err "Porkbun API error: $($create.message)"; exit 1 }
        } else {
            Write-Info "Dry run only (pass -Apply to write the record above)."
        }
    }
}

# ---------- Domain-verification TXT + DKIM CNAMEs: plain idempotent create --
function Sync-VerificationRecord {
    <#
    IMPORTANT: for TXT records, $existing can include records that have
    NOTHING to do with this verification type — e.g. the SPF record lives at
    the same host name as the domain-verification TXT. Deleting everything
    in $existing (as this used to do) silently destroyed the SPF record on a
    live dev domain. Only ever delete a "stale" record whose content matches
    -StalePrefixMatch (a prefix distinctive to THIS record's own purpose,
    e.g. 'ms-domain-verification=') — required for TXT, since TXT is the
    only type here that can share a host name with an unrelated record.
    CNAME names (DKIM/DKIM2 selectors) are dedicated to this one purpose, so
    blanket-replace-at-name is safe there and -StalePrefixMatch isn't needed.
    #>
    param([string]$Key, [string]$PorkbunType, [string]$StalePrefixMatch = $null)
    $record = $records.$Key
    if (-not $record) { return }
    if ($PorkbunType -eq 'TXT' -and -not $StalePrefixMatch) {
        throw "Sync-VerificationRecord: -StalePrefixMatch is required for TXT records (unsafe to blanket-delete a shared host name)."
    }

    Write-Step "$Key record ($PorkbunType $($record.name))"
    $subdomain = Get-PorkbunSubdomain -RecordFqdn $record.name
    $existing = @(Get-ExistingRecords -Domain $target.Domain -Type $PorkbunType -Subdomain $subdomain)
    $desiredValue = $record.value.TrimEnd('.')
    $matching = $existing | Where-Object { $_.content.TrimEnd('.').Trim('"') -eq $desiredValue }

    if ($matching) {
        Write-Success "Already correct — nothing to do."
        return
    }

    $stale = if ($StalePrefixMatch) {
        @($existing | Where-Object { $_.content.Trim('"').StartsWith($StalePrefixMatch) })
    } else {
        $existing
    }

    Write-Info "  would create/replace: $PorkbunType $($record.name) -> $desiredValue"
    if ($stale.Count -lt $existing.Count) {
        Write-Info "  ($($existing.Count - $stale.Count) other unrelated record(s) at this name/type left untouched)"
    }
    $script:anyChanges = $true
    if (-not $Apply) {
        Write-Info "Dry run only (pass -Apply to write the record above)."
        return
    }
    foreach ($s in $stale) {
        Invoke-PorkbunApi -Path "dns/delete/$($target.Domain)/$($s.id)" | Out-Null
    }
    $create = Invoke-PorkbunApi -Path "dns/create/$($target.Domain)" -ExtraBody @{ name = $subdomain; type = $PorkbunType; content = $record.value; ttl = '600' }
    if ($create.status -eq 'SUCCESS') { Write-Success "$Key record written." } else { Write-Err "Porkbun API error: $($create.message)"; exit 1 }
}

Sync-VerificationRecord -Key 'Domain' -PorkbunType 'TXT' -StalePrefixMatch 'ms-domain-verification='
Sync-VerificationRecord -Key 'DKIM' -PorkbunType 'CNAME'
Sync-VerificationRecord -Key 'DKIM2' -PorkbunType 'CNAME'

if (-not $Apply) {
    if ($anyChanges) {
        Write-Info "`nDry run complete — re-run with -Apply (and -Force if the SPF merge above requires it) to write these records."
    } else {
        Write-Success "`nAll verification records already match — nothing to write."
    }
    exit 0
}

# ---------- Kick off verification for whichever record types we touched ----
Write-Step "Initiating verification"
foreach ($type in @('Domain', 'SPF', 'DKIM', 'DKIM2')) {
    if (-not $records.$type) { continue }
    az communication email domain initiate-verification `
        --domain-name $fqdn --email-service-name $emailServiceName -g $resourceGroup `
        --verification-type $type | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "initiate-verification failed for $type — DNS may not have propagated yet, retry later."
    } else {
        Write-Success "Verification requested for $type."
    }
}

Write-Info "`nVerification is async — re-run this script (dry run) later to check updated verificationStates, or:"
Write-Info "  az communication email domain show --domain-name $fqdn --email-service-name $emailServiceName -g $resourceGroup --query verificationStates"
