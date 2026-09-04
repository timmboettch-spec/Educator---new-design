#!/usr/bin/env pwsh
# Aggregated Teams notification: resolve a GitHub login to an Entra @mention
# (RW Thrive SCIM convention: firstname-lastname_rwthrive -> firstname.lastname@rwthrive.com),
# then post an Adaptive Card. No-op when WEBHOOK_URL is empty.
$ErrorActionPreference = 'Stop'

$webhookUrl = $env:WEBHOOK_URL
if ([string]::IsNullOrEmpty($webhookUrl)) {
    Write-Host "No webhook configured — skipping Teams notification"
    exit 0
}

# ---- resolve mention -------------------------------------------------------
$ghLogin = $env:GH_LOGIN
$mentionUpn = ""
$mentionName = $ghLogin

if ($ghLogin -and $ghLogin.EndsWith("_rwthrive")) {
    $base = $ghLogin.Substring(0, $ghLogin.Length - "_rwthrive".Length)
    $mentionUpn = ($base -replace '-', '.') + "@rwthrive.com"
    $mentionName = (($base -split '-') | ForEach-Object {
        if ($_.Length -gt 0) { $_.Substring(0, 1).ToUpper() + $_.Substring(1) } else { $_ }
    }) -join ' '
}

# ---- build + post card -----------------------------------------------------
# The mention line only renders when a prefix/suffix is supplied — callers
# that want no mention line at all (e.g. a success card with no ping) pass
# both empty. When github-login doesn't resolve to an Entra UPN (external
# collaborator/bot), the line still renders with the plain login name instead
# of silently disappearing, matching notify-pending-approval.yml / sast.yml's
# "Submitted by X" fallback.
$headline      = $env:HEADLINE
$style         = $env:STYLE
$subtitle      = $env:SUBTITLE
$mentionPrefix = $env:MENTION_PREFIX
$mentionSuffix = $env:MENTION_SUFFIX
$footer        = $env:FOOTER

$hasSubtitle    = -not [string]::IsNullOrEmpty($subtitle)
$hasMention     = (-not [string]::IsNullOrEmpty($mentionName)) -and (-not [string]::IsNullOrEmpty($mentionUpn))
$hasMentionLine = (-not [string]::IsNullOrEmpty($mentionName)) -and ((-not [string]::IsNullOrEmpty($mentionPrefix)) -or (-not [string]::IsNullOrEmpty($mentionSuffix)))
$hasFooter      = -not [string]::IsNullOrEmpty($footer)

$mentionText = if ($hasMention) { "<at>$mentionName</at>" } else { $mentionName }
$mentionLineText = "$mentionPrefix$mentionText$mentionSuffix"

$factsJson = if ([string]::IsNullOrEmpty($env:FACTS_JSON)) { '[]' } else { $env:FACTS_JSON }
$actionsJson = if ([string]::IsNullOrEmpty($env:ACTIONS_JSON)) { '[]' } else { $env:ACTIONS_JSON }
# @(...) forces array context even when the parsed JSON has exactly one
# element — ConvertFrom-Json otherwise unwraps a single-element array to a
# bare object, which would then re-serialize as a scalar, not a JSON array.
$facts = @(ConvertFrom-Json $factsJson)
$actions = @(ConvertFrom-Json $actionsJson)

$bodyItems = @([ordered]@{ type = "TextBlock"; text = $headline; weight = "Bolder"; size = "Medium"; wrap = $true })
if ($hasSubtitle) { $bodyItems += [ordered]@{ type = "TextBlock"; text = $subtitle; wrap = $true; spacing = "Small"; isSubtle = $true } }
if ($hasMentionLine) { $bodyItems += [ordered]@{ type = "TextBlock"; text = $mentionLineText; wrap = $true; spacing = "Small" } }

$cardBody = @(
    [ordered]@{ type = "Container"; style = $style; items = $bodyItems }
    [ordered]@{ type = "FactSet"; facts = $facts }
)
if ($hasFooter) { $cardBody += [ordered]@{ type = "TextBlock"; text = $footer; isSubtle = $true; size = "Small"; wrap = $true } }

# Teams Workflows (the Power Automate-backed webhook that replaced classic
# Office 365 Connectors) feeds the "Post card in a chat or channel" action
# straight from the request body, so the body must BE the Adaptive Card — not
# the old connector envelope ({type:"message", attachments:[...]}). Wrapping
# it makes the flow see root type "message" instead of "AdaptiveCard" and
# fail with AdaptiveSerializationException.
$card = [ordered]@{
    '$schema' = "http://adaptivecards.io/schemas/adaptive-card.json"
    type      = "AdaptiveCard"
    version   = "1.4"
    body      = $cardBody
    actions   = $actions
}

# Teams requires every msteams.entities[].text to appear literally in the
# card body, or the flow's Post card action fails with BadArgument: "One or
# more mention entity could not be found in card text". hasMention only means
# the login resolved to an Entra UPN — it says nothing about whether the <at>
# tag actually got rendered anywhere (a caller can resolve a mention but
# suppress the mention line by leaving both mention-prefix and
# mention-suffix empty). Gate on hasMentionLine, the thing that actually
# controls whether <at>Name</at> is in the body.
if ($hasMention -and $hasMentionLine) {
    $card.msteams = [ordered]@{
        entities = @(
            [ordered]@{
                type      = "mention"
                text      = "<at>$mentionName</at>"
                mentioned = [ordered]@{ id = $mentionUpn; name = $mentionName }
            }
        )
    }
}

$payload = $card | ConvertTo-Json -Depth 10

# Check the trigger's own response instead of assuming success: a rejected/
# malformed request must not look identical to a real success in the Actions
# log. -SkipHttpErrorCheck reports non-2xx status without throwing, so this
# can inspect the status the same way for success and failure. Note this
# still only confirms the Power Automate HTTP trigger ACCEPTED the request
# (typically HTTP 202) — a Teams Workflow trigger responds before the flow
# finishes running, so a downstream action failure inside the flow itself
# (e.g. "Post card in a chat or channel" rejecting the card) will still show
# green here. Check the flow's own run history in Power Automate to confirm
# the card actually rendered.
$response = Invoke-WebRequest -Uri $webhookUrl -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 30 -UseBasicParsing -SkipHttpErrorCheck
$httpStatus = [int]$response.StatusCode
$responseBody = $response.Content

Write-Host "Webhook trigger responded: HTTP $httpStatus"
if ($responseBody) { Write-Host "Response body: $responseBody" }

if ($httpStatus -lt 200 -or $httpStatus -ge 300) {
    Write-Host "::error::Teams webhook trigger rejected the request (HTTP $httpStatus): $responseBody"
    exit 1
}

$mentionDisplay = if ($mentionName) { $mentionName } else { "none" }
Write-Host "Teams card posted (mention: $mentionDisplay, HTTP $httpStatus)"
