<#
.SYNOPSIS
    Shared helper: sign a short-lived GitHub App JWT (RS256), in-process.

.DESCRIPTION
    Dot-sourced by Provision-Snapshot-Prod.ps1 and New-SnapshotGitHubApp.ps1
    so both build/verify App auth the same way. Uses .NET's RSA class
    directly — no openssl dependency, works identically on Windows/macOS/
    Linux pwsh 7+.
#>

function ConvertTo-Base64Url([byte[]]$Bytes) {
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-GitHubAppJwt([string]$AppId, [string]$PrivateKeyPem) {
    $now = [DateTimeOffset]::UtcNow
    $header  = @{ alg = 'RS256'; typ = 'JWT' } | ConvertTo-Json -Compress
    $payload = @{
        iat = $now.AddSeconds(-60).ToUnixTimeSeconds()
        exp = $now.AddMinutes(9).ToUnixTimeSeconds()
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
    $signatureB64 = ConvertTo-Base64Url $signature

    "$signingInput.$signatureB64"
}

function Resolve-GitHubAppInstallationId([string]$AppId, [string]$PrivateKeyPem, [string]$Repo) {
    $jwt = New-GitHubAppJwt -AppId $AppId -PrivateKeyPem $PrivateKeyPem
    $installation = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$Repo/installation" `
        -Headers @{ Authorization = "Bearer $jwt"; Accept = 'application/vnd.github+json' } `
        -Method Get
    "$($installation.id)"
}

function Test-GitHubAppInstallationToken([string]$AppId, [string]$PrivateKeyPem, [string]$InstallationId) {
    $jwt = New-GitHubAppJwt -AppId $AppId -PrivateKeyPem $PrivateKeyPem
    Invoke-RestMethod `
        -Uri "https://api.github.com/app/installations/$InstallationId/access_tokens" `
        -Headers @{ Authorization = "Bearer $jwt"; Accept = 'application/vnd.github+json' } `
        -Method Post
}
