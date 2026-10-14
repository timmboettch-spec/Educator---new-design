#Requires -Version 7.0
<#
.SYNOPSIS
    Weekly snapshot-to-git: pull the backend's JSON blob data and land it in
    the private student-app-scenario-snapshot repo via a branch + PR + merge
    (not a direct push to main), so every weekly snapshot shows up as a
    reviewable PR in the repo's history.

.DESCRIPTION
    Runs as the single container of the "snapshot" Container Apps Job
    (infra/modules/containerAppJob-snapshot.bicep), triggered on the cron
    schedule set there. The GitHub App private key and (optionally) a Teams
    webhook URL are resolved by the Container Apps platform itself from Key
    Vault via the job's user-assigned managed identity and injected as env
    vars — this script never fetches them a second time over the Key Vault
    REST API. Blob Storage reads go over the Storage REST API using a token
    from the Managed Identity endpoint instead of the `Az` PowerShell
    module, so the image stays small and there's no module-import cold
    start on every run.

    Requires the GitHub App to have the "Pull requests: Read and write"
    repository permission in addition to "Contents: Read and write" — the
    branch push alone only needs Contents, but opening and merging the PR
    needs Pull requests too. This is a manual, one-time change in the App's
    settings (GitHub Apps don't expose permission edits via API), and since
    it's a permission *increase* on an already-installed App, the org must
    re-accept it on the App's installation page afterward.

    Exits 0 on a no-op week (nothing changed) — a job that "fails" every
    week nothing changed would train the team to ignore real failures.

.NOTES
    Required env vars (wired by containerAppJob-snapshot.bicep):
      SOURCE_STORAGE_ACCOUNT, SOURCE_CONTAINER   - blob source
      GIT_APP_ID, GIT_APP_INSTALLATION_ID        - GitHub App identifiers (not secret)
      SNAPSHOT_REPO                              - "Realityworks-AI/student-app-scenario-snapshot"
      GIT_APP_PRIVATE_KEY (secretRef)            - PEM private key, from Key Vault
      TEAMS_WEBHOOK_URL (secretRef, optional)    - Teams incoming webhook, from Key Vault
      SNAPSHOT_UAI_CLIENT_ID                     - client ID of the job's user-assigned identity
      IDENTITY_ENDPOINT, IDENTITY_HEADER         - injected by the Container Apps platform itself
                                                    (not by containerAppJob-snapshot.bicep) whenever
                                                    the job has a managed identity attached
#>

$ErrorActionPreference = 'Stop'

# Root-level flat, single-blob files (scenarios.json, default-scenarios.json,
# reports.json, transcripts.json, units.json, classes.json,
# conversation-responses.json, username-units.json, users.json,
# actions.json) are DELIBERATELY NOT pulled — per the actual requirement
# (scenario files are the daily priority; root-level JSONs add no value
# here and their multi-tens-of-MB size is exactly what makes weekly diffs
# unreadable in the first place; transcripts/reports are captured via
# their individual per-record files below instead, which is the whole
# reason those exist).
#
# Individual per-record files, enumerated via the List Blobs API and
# downloaded with bounded concurrency (there can be thousands):
#   - en/scenario/, es/scenario/ — the actual source of truth for scenario
#     content (json-data.service.ts's loadAllScenarioFiles: "Only the
#     canonical English files ... this is the source of truth";
#     scenarios.json is explicitly a legacy fallback). Mirrors
#     SUPPORTED_SCENARIO_LANGUAGES (currently just 'es' alongside 'en').
#     These are the priority: they need to land daily, reliably.
#   - reports/, transcripts/ — bonus/nice-to-have. Skip (or trim) these
#     first if they ever threaten the daily scenario-file cadence.
$IndividualFilePrefixes = @('en/scenario/', 'es/scenario/', 'reports/', 'transcripts/')

# Matches json-data.service.ts's SCENARIO_HYDRATION_CONCURRENCY default —
# same reasoning: thousands of small blobs, one HTTPS round-trip each,
# serial downloads would turn a few-second job into a multi-minute one.
$HydrationConcurrency = [Math]::Max(1, [int]($env:SNAPSHOT_HYDRATION_CONCURRENCY ?? '32'))

# Per-request timeout and retry budget for Blob Storage calls. With ~30k
# blobs per run, a single transient timeout/5xx/429 is statistically
# certain; without retries one such blip failed the whole job (and the
# platform-level retry then redid 10+ minutes of work and hit it again).
$BlobRequestTimeoutSec = [Math]::Max(5, [int]($env:SNAPSHOT_BLOB_TIMEOUT_SEC ?? '60'))
$BlobMaxAttempts = [Math]::Max(1, [int]($env:SNAPSHOT_BLOB_MAX_ATTEMPTS ?? '5'))

function Get-ManagedIdentityToken {
    <#
    Container Apps does NOT expose the VM IMDS endpoint (169.254.169.254) —
    it has its own MSI endpoint (IDENTITY_ENDPOINT/IDENTITY_HEADER env vars,
    same mechanism App Service uses). client_id must be passed explicitly:
    omitting it makes the platform default to a system-assigned identity,
    which this Job doesn't have, and the call fails.
    See https://learn.microsoft.com/azure/container-apps/managed-identity#rest-endpoint-reference
    #>
    param([Parameter(Mandatory)][string]$Resource)
    $uri = "$($env:IDENTITY_ENDPOINT)?resource=$([uri]::EscapeDataString($Resource))&api-version=2019-08-01&client_id=$($env:SNAPSHOT_UAI_CLIENT_ID)"
    $response = Invoke-RestMethod -Uri $uri -Headers @{ 'X-IDENTITY-HEADER' = $env:IDENTITY_HEADER } -Method Get
    return $response.access_token
}

function ConvertTo-Base64Url {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-GitHubAppInstallationToken {
    <#
    Signs a short-lived App JWT (RS256) with the App's private key, then
    exchanges it for an installation access token scoped to the one repo
    the App is installed on.
    #>
    param(
        [Parameter(Mandatory)][string]$AppId,
        [Parameter(Mandatory)][string]$InstallationId,
        [Parameter(Mandatory)][string]$PrivateKeyPem
    )

    $now = [DateTimeOffset]::UtcNow
    $header = @{ alg = 'RS256'; typ = 'JWT' } | ConvertTo-Json -Compress
    $payload = @{
        iat = $now.AddSeconds(-60).ToUnixTimeSeconds()   # allow for clock drift
        exp = $now.AddMinutes(9).ToUnixTimeSeconds()      # GitHub caps this at 10 min
        iss = $AppId
    } | ConvertTo-Json -Compress

    $headerB64  = ConvertTo-Base64Url ([System.Text.Encoding]::UTF8.GetBytes($header))
    $payloadB64 = ConvertTo-Base64Url ([System.Text.Encoding]::UTF8.GetBytes($payload))
    $signingInput = "$headerB64.$payloadB64"

    $rsa = [System.Security.Cryptography.RSA]::Create()
    $rsa.ImportFromPem($PrivateKeyPem)
    $signature = $rsa.SignData(
        [System.Text.Encoding]::UTF8.GetBytes($signingInput),
        [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $rsa.Dispose()

    $jwt = "$signingInput.$(ConvertTo-Base64Url $signature)"

    $tokenUri = "https://api.github.com/app/installations/$InstallationId/access_tokens"
    $response = Invoke-RestMethod -Uri $tokenUri -Method Post -Headers @{
        Authorization        = "Bearer $jwt"
        Accept               = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
    return $response.token
}

function Sort-JsonKeysRecursively {
    <#
    jq --sort-keys equivalent: Hashtable enumeration order isn't guaranteed
    to be sorted, so keys are re-sorted recursively before serializing —
    this is what makes weekly diffs show only real content changes instead
    of noise from key reordering.

    Operates on Hashtables/arrays (from ConvertFrom-Json -AsHashtable), NOT
    PSCustomObjects — rebuilding into PSCustomObject via [ordered]@{} +
    Add-Member-style property assignment is dramatically more expensive per
    node than a plain [ordered] hashtable, and blew the job's memory limit
    on prod's larger files (reports.json) under the original PSCustomObject
    approach. Also uses a preallocated List + indexed loop for arrays
    instead of the ForEach-Object pipeline, which avoids per-item pipeline
    overhead on large arrays.
    #>
    param($InputObject)

    if ($InputObject -is [System.Collections.IDictionary]) {
        $sorted = [ordered]@{}
        foreach ($key in ($InputObject.Keys | Sort-Object)) {
            $sorted[$key] = Sort-JsonKeysRecursively $InputObject[$key]
        }
        return $sorted
    }

    if ($InputObject -is [System.Collections.IList]) {
        $result = [System.Collections.Generic.List[object]]::new($InputObject.Count)
        foreach ($item in $InputObject) {
            $result.Add((Sort-JsonKeysRecursively $item))
        }
        return $result
    }

    return $InputObject
}

function Get-BlobNamesByPrefix {
    <#
    Lists blob names under $Prefix via the List Blobs REST API, paginating
    with the continuation marker (Azure returns at most 5000 per call).
    #>
    param(
        [Parameter(Mandatory)][string]$Prefix,
        [Parameter(Mandatory)][string]$StorageToken
    )

    $names = [System.Collections.Generic.List[string]]::new()
    $marker = ''
    do {
        $listUri = "https://$($env:SOURCE_STORAGE_ACCOUNT).blob.core.windows.net/$($env:SOURCE_CONTAINER)?restype=container&comp=list&prefix=$([uri]::EscapeDataString($Prefix))&maxresults=5000"
        if ($marker) { $listUri += "&marker=$([uri]::EscapeDataString($marker))" }
        # TrimStart the UTF-8 BOM (U+FEFF) Azure Storage's XML response
        # starts with — casting straight to [xml] chokes on it ("specified
        # node cannot be inserted... wrong type") since it isn't valid
        # content before an XML declaration.
        $body = ''
        for ($attempt = 1; $attempt -le $BlobMaxAttempts; $attempt++) {
            try {
                $body = (Invoke-WebRequest -Uri $listUri -TimeoutSec $BlobRequestTimeoutSec -Headers @{
                    'x-ms-version'  = '2023-11-03'
                    'Authorization' = "Bearer $StorageToken"
                }).Content.TrimStart([char]0xFEFF)
                break
            } catch {
                if ($attempt -eq $BlobMaxAttempts) { throw }
                Write-Warning "List $Prefix failed (attempt $attempt/$BlobMaxAttempts): $($_.Exception.Message)"
                Start-Sleep -Seconds ([Math]::Min(30, [Math]::Pow(2, $attempt)))
            }
        }
        [xml]$resp = $body
        foreach ($blob in $resp.EnumerationResults.Blobs.Blob) {
            if ($blob.Name -like '*.json') { $names.Add([string]$blob.Name) }
        }
        $marker = $resp.EnumerationResults.NextMarker
    } while ($marker)

    return $names
}

function Send-TeamsNotification {
    <#
    Best-effort: TEAMS_WEBHOOK_URL is optional (resolved from Key Vault by
    the Container Apps platform, see containerAppJob-snapshot.bicep) and a
    failed notification should never fail the job itself.

    Failures are tagged (so they actually get noticed in the channel);
    successes are not (so they don't add noise beyond a passive record).

    The webhook here is a Teams Workflow (Power Automate-backed — the
    successor to classic Office 365 Connector webhooks), confirmed from its
    URL shape (powerplatform.com/.../workflows/.../triggers/manual/...).
    That flow's "Post card in a chat or channel" action expects the
    request body to BE the Adaptive Card itself (root type "AdaptiveCard"),
    not the old connector envelope ({type:"message", attachments:[...]})
    — wrapping it makes the flow fail with AdaptiveSerializationException.
    This mirrors .github/actions/teams-notify/scripts/teams-notify.sh,
    the pattern already used elsewhere in this repo for the same kind of
    webhook, rather than inventing a new schema.

    A real @mention (not just a visual red card) requires the mentioned
    person's UPN to appear in BOTH the card body text (as literal
    <at>Name</at>) AND msteams.entities, or Teams' "Post card" action
    rejects the whole request with "mention entity could not be found in
    card text" — so both must be added together, never just one.
    $env:SNAPSHOT_TEAMS_MENTION, if set to a UPN (e.g.
    someone@rwthrive.com), is only ever applied on failure.
    #>
    param(
        [Parameter(Mandatory)][string]$Headline,
        [string]$Subtitle = '',
        [switch]$IsFailure,
        [hashtable[]]$Facts = @()
    )

    if ([string]::IsNullOrWhiteSpace($env:TEAMS_WEBHOOK_URL)) {
        return
    }

    $mentionUpn = if ($IsFailure) { $env:SNAPSHOT_TEAMS_MENTION } else { '' }
    $hasMention = -not [string]::IsNullOrWhiteSpace($mentionUpn)
    $mentionName = if ($hasMention) {
        ($mentionUpn.Split('@')[0].Split('.') | ForEach-Object {
            if ($_.Length -gt 0) { $_.Substring(0,1).ToUpper() + $_.Substring(1) } else { $_ }
        }) -join ' '
    } else { '' }

    $bodyItems = [System.Collections.Generic.List[object]]::new()
    $bodyItems.Add(@{ type = 'TextBlock'; text = $Headline; weight = 'Bolder'; size = 'Medium'; wrap = $true })
    if ($Subtitle) {
        $bodyItems.Add(@{ type = 'TextBlock'; text = $Subtitle; wrap = $true; spacing = 'Small'; isSubtle = $true })
    }
    if ($hasMention) {
        $bodyItems.Add(@{ type = 'TextBlock'; text = "<at>$mentionName</at> — the daily snapshot failed."; wrap = $true; spacing = 'Small' })
    }

    $containerStyle = 'good'
    if ($IsFailure) { $containerStyle = 'attention' }

    $card = [ordered]@{
        '$schema' = 'http://adaptivecards.io/schemas/adaptive-card.json'
        type      = 'AdaptiveCard'
        version   = '1.4'
        body      = @(
            @{ type = 'Container'; style = $containerStyle; items = $bodyItems }
            @{ type = 'FactSet'; facts = $Facts }
        )
        actions   = @()
    }
    if ($hasMention) {
        $card['msteams'] = @{
            entities = @(
                @{ type = 'mention'; text = "<at>$mentionName</at>"; mentioned = @{ id = $mentionUpn; name = $mentionName } }
            )
        }
    }

    try {
        $body = $card | ConvertTo-Json -Depth 10 -Compress
        Invoke-RestMethod -Uri $env:TEAMS_WEBHOOK_URL -Method Post -ContentType 'application/json' -Body $body | Out-Null
    } catch {
        Write-Warning "Failed to send Teams notification: $_"
    }
}

try {
    $workDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid())
    $repoDir = Join-Path $workDir 'snapshot-repo'
    New-Item -ItemType Directory -Path $workDir -Force | Out-Null

    Write-Host 'Fetching Managed Identity token for Storage...'
    $storageToken = Get-ManagedIdentityToken -Resource 'https://storage.azure.com/'

    Write-Host 'Exchanging GitHub App credentials for an installation token...'
    $ghToken = Get-GitHubAppInstallationToken -AppId $env:GIT_APP_ID -InstallationId $env:GIT_APP_INSTALLATION_ID -PrivateKeyPem $env:GIT_APP_PRIVATE_KEY

    Write-Host "Cloning $($env:SNAPSHOT_REPO)..."
    git clone "https://x-access-token:$ghToken@github.com/$($env:SNAPSHOT_REPO).git" $repoDir
    Set-Location $repoDir
    New-Item -ItemType Directory -Path 'data' -Force | Out-Null

    # One-time cleanup: earlier runs committed these root-level flat files
    # before the scope was narrowed to individual per-record files only.
    # They're now stale (never rewritten, so a leftover from whenever the
    # data last happened to be pulled) and were exactly the multi-tens-of-MB
    # bloat this rescoping was meant to eliminate — so remove them outright
    # rather than leaving them to rot in the repo. `git rm --ignore-unmatch`
    # is a no-op once they're gone, so this is safe to leave in permanently.
    git rm --ignore-unmatch -q -- `
        data/scenarios.json data/es/scenarios.json data/default-scenarios.json `
        data/reports.json data/transcripts.json data/units.json data/classes.json `
        data/conversation-responses.json data/username-units.json data/users.json `
        data/actions.json | Out-Null

    # Individual per-record files — see the note by $IndividualFilePrefixes
    # above for why each prefix is here (scenarios: sole source of truth;
    # reports/transcripts: same data as the bulk file, pulled again per-id
    # purely so weekly diffs are readable). There can be thousands, so
    # they're listed via the Blob API and downloaded with bounded
    # concurrency (ForEach-Object -Parallel), mirroring the backend's own
    # SCENARIO_HYDRATION_CONCURRENCY pattern rather than one HTTPS
    # round-trip at a time.
    foreach ($prefix in $IndividualFilePrefixes) {
        Write-Host "Listing $prefix..."
        $blobNames = Get-BlobNamesByPrefix -Prefix $prefix -StorageToken $storageToken
        Write-Host "  Found $($blobNames.Count) file(s) under $prefix"

        # Prune: the repo clone still has whatever the PREVIOUS run committed
        # under this prefix. If a blob was deleted from source since then,
        # it's simply absent from $blobNames above and the download loop
        # below never touches it — so without this step, a deleted scenario/
        # report/transcript would sit in the snapshot repo forever instead
        # of tracking deletions. Compare what's on disk to what's actually in
        # blob storage right now and remove anything no longer there.
        $dataDir = Join-Path $repoDir 'data'
        $prefixDir = Join-Path $dataDir $prefix
        if (Test-Path $prefixDir) {
            $blobNameSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$blobNames)
            Get-ChildItem -Path $prefixDir -Recurse -File -Filter '*.json' | ForEach-Object {
                $relativeName = $_.FullName.Substring($dataDir.Length + 1) -replace '\\', '/'
                if (-not $blobNameSet.Contains($relativeName)) {
                    Write-Host "  Removing (deleted from source): $relativeName"
                    Remove-Item -Path $_.FullName -Force
                }
            }
        }

        if ($blobNames.Count -eq 0) { continue }

        $sortFuncDef = ${function:Sort-JsonKeysRecursively}.ToString()
        $blobNames | ForEach-Object -Parallel {
            $blobName = $_
            Invoke-Expression "function Sort-JsonKeysRecursively { $($using:sortFuncDef) }"

            # Environment variables are process-wide, not runspace-local, so
            # $env: is readable here directly without $using: — unlike
            # ordinary script-scoped variables (storageToken, repoDir below).
            $blobUri = "https://$($env:SOURCE_STORAGE_ACCOUNT).blob.core.windows.net/$($env:SOURCE_CONTAINER)/$blobName"
            $rawResponse = $null
            for ($attempt = 1; $attempt -le $using:BlobMaxAttempts; $attempt++) {
                try {
                    $rawResponse = Invoke-WebRequest -Uri $blobUri -TimeoutSec $using:BlobRequestTimeoutSec -Headers @{
                        'x-ms-version'  = '2023-11-03'
                        'Authorization' = "Bearer $($using:storageToken)"
                    }
                    break
                } catch {
                    # 404: deleted between list and download — not transient,
                    # and not worth failing the run; the next run prunes it.
                    if ($_.Exception.Response.StatusCode -eq 404) { return }
                    if ($attempt -eq $using:BlobMaxAttempts) {
                        throw "Failed to download $blobName after $attempt attempt(s): $($_.Exception.Message)"
                    }
                    Write-Warning "Download $blobName failed (attempt $attempt/$($using:BlobMaxAttempts)): $($_.Exception.Message)"
                    Start-Sleep -Seconds ([Math]::Min(30, [Math]::Pow(2, $attempt)) + (Get-Random -Maximum 1.0))
                }
            }
            $parsed = $rawResponse.Content | ConvertFrom-Json -AsHashtable -Depth 100
            $sorted = Sort-JsonKeysRecursively $parsed

            $destPath = Join-Path (Join-Path $using:repoDir 'data') $blobName
            New-Item -ItemType Directory -Path (Split-Path $destPath -Parent) -Force | Out-Null
            $sorted | ConvertTo-Json -Depth 100 | Set-Content -Path $destPath -NoNewline
        } -ThrottleLimit $HydrationConcurrency
    }

    git config user.name 'hs-online-snapshot-bot'
    git config user.email 'snapshot-bot@realityworks.ai'

    git add -A

    # `git diff --cached --quiet` exits 1 when there IS a diff — the exact
    # week this job needs to keep running. On PowerShell 7.3+,
    # $PSNativeCommandUseErrorActionPreference defaults to $true, so with
    # $ErrorActionPreference = 'Stop' that nonzero exit would throw and abort
    # the script before $hasChanges is ever computed. `git status --porcelain`
    # always exits 0 regardless of working-tree state, so it's used instead.
    $changedFiles = git status --porcelain
    $hasChanges = -not [string]::IsNullOrEmpty($changedFiles)

    if (-not $hasChanges) {
        Write-Host 'No changes detected — skipping commit.'
        exit 0
    }

    $snapshotDate = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-dd')
    # Random suffix in case the job runs more than once in a day (ad hoc
    # trigger the same day as the scheduled run) — branch names must be
    # unique per push.
    $branchName = "snapshot/$snapshotDate-$([System.Guid]::NewGuid().ToString('N').Substring(0, 6))"

    git checkout -b $branchName
    git commit -m "snapshot: $snapshotDate"
    git push origin "HEAD:$branchName"

    Write-Host "Opening PR from $branchName..."
    $prBody = @{
        title = "snapshot: $snapshotDate"
        head  = $branchName
        base  = 'main'
        body  = "Automated weekly snapshot for $snapshotDate."
    } | ConvertTo-Json
    $pr = Invoke-RestMethod -Uri "https://api.github.com/repos/$($env:SNAPSHOT_REPO)/pulls" -Method Post -Headers @{
        Authorization          = "Bearer $ghToken"
        Accept                 = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
    } -Body $prBody -ContentType 'application/json'

    Write-Host "Merging PR #$($pr.number)..."
    $mergeResult = Invoke-RestMethod -Uri "https://api.github.com/repos/$($env:SNAPSHOT_REPO)/pulls/$($pr.number)/merge" -Method Put -Headers @{
        Authorization          = "Bearer $ghToken"
        Accept                 = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
    } -Body (@{ merge_method = 'squash' } | ConvertTo-Json) -ContentType 'application/json'

    if (-not $mergeResult.merged) {
        throw "PR #$($pr.number) did not merge: $($mergeResult.message)"
    }

    # Best-effort cleanup — a leftover branch isn't worth failing the run over.
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$($env:SNAPSHOT_REPO)/git/refs/heads/$branchName" -Method Delete -Headers @{
            Authorization          = "Bearer $ghToken"
            Accept                 = 'application/vnd.github+json'
            'X-GitHub-Api-Version' = '2022-11-28'
        } | Out-Null
    } catch {
        Write-Warning "Failed to delete branch $branchName after merge: $_"
    }

    Write-Host "Snapshot PR #$($pr.number) merged for $snapshotDate."
    Send-TeamsNotification -Headline "✅ hs-online snapshot" -Subtitle "Merged PR #$($pr.number) for $snapshotDate" -Facts @(
        @{ title = 'Repo'; value = $env:SNAPSHOT_REPO }
        @{ title = 'PR'; value = "#$($pr.number)" }
        @{ title = 'Date'; value = $snapshotDate }
    )
} catch {
    Send-TeamsNotification -IsFailure -Headline "🔴 hs-online snapshot FAILED" -Facts @(
        @{ title = 'Error'; value = $_.Exception.Message }
    )
    throw
}
