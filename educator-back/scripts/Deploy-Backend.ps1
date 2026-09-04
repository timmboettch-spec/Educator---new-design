<#
.SYNOPSIS
    Backend deployment script for Educator App. For full infrastructure provisioning, use Deploy-EducatorApp.ps1 from the frontend repo.

.DESCRIPTION
    This script handles backend-specific operations:
    - Backend Container App provisioning
    - Database setup and migrations
    - API configuration
    - Backend-specific secrets and environment variables
    - Health checks and monitoring

    For end-to-end provisioning, use the main deployment script in the frontend repository.

.PARAMETER Environment
    The deployment environment: dev, qa, or prod

.PARAMETER Action
    The action to perform:
    - provision: Create backend infrastructure
    - migrate: Run database migrations and auto-seed (if configured)
    - seed: Manually run database seeders
    - secrets: Update backend-specific secrets
    - sp: Configure GitHub Actions OIDC authentication (no password rotation needed!)
    - dns: Configure custom domain and DNS records via Porkbun
    - health: Check backend health status
    - logs: View backend logs

.PARAMETER GitHubOrg
    GitHub organization or username (for forks). Default: Realityworks-AI

.PARAMETER GitHubRepo
    GitHub repository name. Default: Educator-App-Backend

.PARAMETER PorkbunApiKey
    Porkbun API key for DNS automation. Can also be set via PORKBUN_API_KEY environment variable.
    Get your API keys from: https://porkbun.com/account/api

.PARAMETER PorkbunSecretKey
    Porkbun secret API key for DNS automation. Can also be set via PORKBUN_SECRET_KEY environment variable.

.PARAMETER UsePorkbunDNS
    Switch to automatically configure DNS records via Porkbun API instead of manual configuration.

.EXAMPLE
    .\Deploy-Backend.ps1 -Environment qa -Action provision

.EXAMPLE
    .\Deploy-Backend.ps1 -Environment prod -Action migrate

.EXAMPLE
    # Setup GitHub Actions OIDC authentication
    .\Deploy-Backend.ps1 -Action sp

#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "qa", "prod")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("provision", "migrate", "seed", "secrets", "dns", "health", "logs", "sp")]
    [string]$Action = "provision",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubOrg = "Realityworks-AI",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubRepo = "Educator-App-Backend",
    
    [Parameter(Mandatory=$false)]
    [string]$PorkbunApiKey = $env:PORKBUN_API_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$PorkbunSecretKey = $env:PORKBUN_SECRET_KEY,
    
    [Parameter(Mandatory=$false)]
    [switch]$UsePorkbunDNS
)

#region ==================== CONFIGURATION ====================
$AZUREVERSION = "1"
$CONTAINERVERSION = "1"
$AZPREFIX = "rwai"  # Organization prefix (shared with other platform apps)
$APP = "edu"        # Application identifier
$LOCATION = "East US 2"  # East US is restricted for PostgreSQL

# Resource naming (environment-specific) - uses existing platform resource groups
$RESOURCE_GROUP = "ARG-" + $Environment + $AZUREVERSION + "-" + $AZPREFIX

# Container Apps Environment - per-env for all environments (created if missing)
$ENVIRONMENT_NAME = "AEN-" + $Environment + $AZUREVERSION + "-" + $AZPREFIX
$ENVIRONMENT_RESOURCE_GROUP = $RESOURCE_GROUP  # AEN lives in per-env RG

$BACKEND_CONTAINER_APP_NAME = "aca-" + $Environment + $CONTAINERVERSION + "-" + $AZPREFIX + "-" + $APP + "back"
$KEY_VAULT_NAME = "akv" + $Environment + $AZUREVERSION + $AZPREFIX  # Existing shared KV (no edu suffix)
$APP_INSIGHTS_NAME = "appi-all" + $AZUREVERSION + "-" + $AZPREFIX  # Shared App Insights
$LOG_ANALYTICS_NAME = "ALA-all" + $AZUREVERSION + "-" + $AZPREFIX

# Shared resources (platform-wide, in ARG-all1-rwai)
$ALL_RESOURCE_GROUP = "ARG-all" + $AZUREVERSION + "-" + $AZPREFIX
$CONTAINERREGISTRY_NAME = "acrall" + $AZUREVERSION + $AZPREFIX

# ACR login server (has unique suffix, must be resolved dynamically)
$ACR_LOGIN_SERVER = $null  # Will be resolved during provision action

# Azure PostgreSQL Database Configuration
$DB_SERVER_NAME = "psql-" + $Environment + $AZUREVERSION + "-" + $AZPREFIX + "-" + $APP
$DB_NAME = "educator_" + $Environment
$DB_USER = "sqladmin"

# Backend API Port
$BACKEND_API_PORT = 3000
$BACKEND_HEALTH_ENDPOINT = "/health"

# Image configuration
$BACKEND_IMAGE_NAME = "educator-backend"
$BACKEND_IMAGE_VERSION = "1"

# Custom Domain Configuration (for DNS setup)
$CUSTOM_DOMAIN_BACKEND = @{
    "dev"   = "dev.educatorbe.realityworksai.com"
    "qa"    = "qa.educatorbe.realityworksai.com"
    "prod"  = "educatorbe.realityworksai.com"
}

# Configuration file paths
$DEPLOYMENT_DIR = Split-Path -Parent $PSScriptRoot
$CONTAINER_SPEC_FILE = Join-Path -Path $DEPLOYMENT_DIR -ChildPath ".deployment" | Join-Path -ChildPath "container-spec.json"
$SEEDING_CONFIG_FILE = Join-Path -Path $DEPLOYMENT_DIR -ChildPath ".deployment" | Join-Path -ChildPath "seeding-config.json"

# Load container specifications
$ContainerSpecs = if (Test-Path $CONTAINER_SPEC_FILE) {
    Get-Content $CONTAINER_SPEC_FILE | ConvertFrom-Json
} else {
    Write-Warning "Container spec file not found at: $CONTAINER_SPEC_FILE"
    Write-Info "Looking in: $DEPLOYMENT_DIR\.deployment\"
    $null
}

# Load seeding configuration
$SeedingConfig = if (Test-Path $SEEDING_CONFIG_FILE) {
    Get-Content $SEEDING_CONFIG_FILE | ConvertFrom-Json
} else {
    Write-Warning "Seeding config file not found at: $SEEDING_CONFIG_FILE"
    $null
}

# Get environment-specific container specs
$EnvContainerSpec = if ($ContainerSpecs) { $ContainerSpecs.$Environment } else { $null }
$Container_CPU = if ($EnvContainerSpec) { $EnvContainerSpec.cpu } else { "1" }
$Container_Memory = if ($EnvContainerSpec) { $EnvContainerSpec.memory } else { "2Gi" }
$Container_MinReplicas = if ($EnvContainerSpec) { $EnvContainerSpec.replicas.min } else { "1" }
$Container_MaxReplicas = if ($EnvContainerSpec) { $EnvContainerSpec.replicas.max } else { "5" }

# Get environment-specific seeding config
$EnvSeedingConfig = if ($SeedingConfig) { $SeedingConfig.$Environment } else { $null }
$Seeding_Enabled = if ($EnvSeedingConfig) { $EnvSeedingConfig.enabled } else { $true }
$Seeding_AutoSeed = if ($EnvSeedingConfig) { $EnvSeedingConfig.autoSeed } else { $true }
$Seeding_Seeders = if ($EnvSeedingConfig) { $EnvSeedingConfig.seeders } else { @("roles") }
#endregion

#region ==================== HELPER FUNCTIONS ====================
function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Gray
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-AzureLogin {
    $account = az account show 2>$null | ConvertFrom-Json
    if (-not $account) {
        Write-Warning "Not logged into Azure CLI. Logging in..."
        az login
    }
    Write-Success "Logged in as: $($account.user.name)"
}

function Test-AzResourceGroupExists {
    param([string]$ResourceGroupName)
    $result = az group exists --name $ResourceGroupName 2>$null
    return $result -eq "true"
}

function Test-AzResourceExists {
    param(
        [string]$ResourceGroupName,
        [string]$ResourceName,
        [string]$ResourceType
    )
    $result = az resource show --name $ResourceName --resource-group $ResourceGroupName --resource-type $ResourceType 2>$null
    return $null -ne $result
}

function Test-AzKeyVaultExists {
    param([string]$KeyVaultName)
    $result = az keyvault show --name $KeyVaultName 2>$null
    return $null -ne $result
}

function Test-AzContainerAppExists {
    param(
        [string]$ResourceGroupName,
        [string]$ContainerAppName
    )
    $result = az containerapp show --name $ContainerAppName --resource-group $ResourceGroupName 2>$null
    return $null -ne $result
}

function Test-AzContainerRegistryExists {
    param([string]$RegistryName)
    $result = az acr show --name $RegistryName 2>$null
    return $null -ne $result
}

function Test-AzPostgresServerExists {
    param([string]$ServerName, [string]$ResourceGroupName)
    $result = az postgres flexible-server show --name $ServerName --resource-group $ResourceGroupName 2>$null
    return $null -ne $result -and $result -ne ""
}

function Test-AzPostgresDatabaseExists {
    param(
        [string]$ServerName,
        [string]$DatabaseName,
        [string]$ResourceGroupName
    )
    $result = az postgres flexible-server db show --server-name $ServerName --database-name $DatabaseName --resource-group $ResourceGroupName 2>$null
    return $null -ne $result -and $result -ne ""
}

# Ensure required Postgres extensions are on the Azure Flexible Server allow-list.
# Without this, `CREATE EXTENSION "uuid-ossp"` (used by migrations for uuid_generate_v4)
# fails with permission denied even for sqladmin. Idempotent: only sets the parameter
# if the required extension is missing from the current value.
function Set-PostgresExtensionAllowList {
    param(
        [string]$ServerName,
        [string]$ResourceGroupName,
        [string[]]$RequiredExtensions = @('UUID-OSSP')
    )
    try {
        $current = az postgres flexible-server parameter show `
            --server-name $ServerName `
            --resource-group $ResourceGroupName `
            --name azure.extensions 2>$null | ConvertFrom-Json
        $existing = @()
        if ($current -and $current.value) {
            $existing = $current.value.Split(',') | Where-Object { $_ -ne '' }
        }
        $existingUpper = $existing | ForEach-Object { $_.ToUpper() }
        $missing = $RequiredExtensions | Where-Object { $existingUpper -notcontains $_.ToUpper() }
        if ($missing.Count -eq 0) {
            Write-Success "Postgres extensions already allow-listed: $($RequiredExtensions -join ', ')"
            return
        }
        $merged = ($existing + $missing) | Sort-Object -Unique
        $value = $merged -join ','
        Write-Info "Adding to azure.extensions: $($missing -join ', ')"
        az postgres flexible-server parameter set `
            --server-name $ServerName `
            --resource-group $ResourceGroupName `
            --name azure.extensions `
            --value $value 2>$null | Out-Null
        Write-Success "Postgres extension allow-list updated: $value"
    } catch {
        Write-Warning "Could not verify/configure azure.extensions parameter: $_"
        Write-Warning "Migrations using uuid-ossp may fail until this is set manually."
    }
}

function Test-AzLogAnalyticsWorkspaceExists {
    param(
        [string]$ResourceGroupName,
        [string]$WorkspaceName
    )
    $result = az monitor log-analytics workspace show --name $WorkspaceName --resource-group $ResourceGroupName 2>$null
    return $null -ne $result
}

#region ==================== PORKBUN DNS MANAGEMENT ====================
function Test-PorkbunCredentials {
    <#
    .SYNOPSIS
        Validates Porkbun API credentials are available, prompting if not set
    
    .PARAMETER Silent
        If true, returns false instead of prompting when credentials are missing
    #>
    param([switch]$Silent)
    
    # Use script-level variables so we can update them
    if (-not $script:PorkbunApiKey) {
        $script:PorkbunApiKey = $PorkbunApiKey
    }
    if (-not $script:PorkbunSecretKey) {
        $script:PorkbunSecretKey = $PorkbunSecretKey
    }
    
    # In silent mode, just check if credentials exist
    if ($Silent) {
        return ($script:PorkbunApiKey -and $script:PorkbunSecretKey)
    }
    
    # Prompt for API key if not set
    if (-not $script:PorkbunApiKey) {
        Write-Host "`nPorkbun API credentials not configured." -ForegroundColor Yellow
        Write-Host "Get your API keys from: https://porkbun.com/account/api" -ForegroundColor Gray
        Write-Host ""
        $script:PorkbunApiKey = Read-Host -Prompt "Enter Porkbun API Key (pk1_...)"
        
        if (-not $script:PorkbunApiKey) {
            Write-Error "Porkbun API Key is required for -UsePorkbunDNS"
            return $false
        }
    }
    
    # Prompt for secret key if not set
    if (-not $script:PorkbunSecretKey) {
        $secureSecret = Read-Host -Prompt "Enter Porkbun Secret Key (sk1_...)" -AsSecureString
        $script:PorkbunSecretKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
        )
        
        if (-not $script:PorkbunSecretKey) {
            Write-Error "Porkbun Secret Key is required for -UsePorkbunDNS"
            return $false
        }
    }
    
    return $true
}

function Set-PorkbunDNSRecord {
    <#
    .SYNOPSIS
        Creates or updates a DNS record via Porkbun API
    
    .DESCRIPTION
        Uses Porkbun's REST API to manage DNS records.
        API Documentation: https://porkbun.com/api/json/v3/documentation
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Domain,
        
        [Parameter(Mandatory=$true)]
        [string]$Subdomain,
        
        [Parameter(Mandatory=$true)]
        [ValidateSet("A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA")]
        [string]$RecordType,
        
        [Parameter(Mandatory=$true)]
        [string]$Content,
        
        [Parameter(Mandatory=$false)]
        [int]$TTL = 600
    )
    
    if (-not (Test-PorkbunCredentials)) {
        return $false
    }
    
    $baseUrl = "https://api.porkbun.com/api/json/v3"
    
    # First, try to delete any existing record with the same name and type
    Write-Info "Checking for existing $RecordType record: $Subdomain.$Domain"
    
    $deleteBody = @{
        secretapikey = $script:PorkbunSecretKey
        apikey = $script:PorkbunApiKey
    } | ConvertTo-Json
    
    try {
        # Get existing records
        $retrieveUrl = "$baseUrl/dns/retrieveByNameType/$Domain/$RecordType/$Subdomain"
        $existingRecords = Invoke-RestMethod -Uri $retrieveUrl -Method Post -Body $deleteBody -ContentType "application/json" -ErrorAction SilentlyContinue
        
        if ($existingRecords.status -eq "SUCCESS" -and $existingRecords.records) {
            foreach ($record in $existingRecords.records) {
                Write-Info "Deleting existing record ID: $($record.id)"
                $deleteUrl = "$baseUrl/dns/delete/$Domain/$($record.id)"
                Invoke-RestMethod -Uri $deleteUrl -Method Post -Body $deleteBody -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
            }
        }
    }
    catch {
        # No existing record, continue with creation
    }
    
    # Create the new record
    Write-Host "  Creating $RecordType record: $Subdomain.$Domain -> $Content" -ForegroundColor Cyan
    
    $createBody = @{
        secretapikey = $script:PorkbunSecretKey
        apikey = $script:PorkbunApiKey
        name = $Subdomain
        type = $RecordType
        content = $Content
        ttl = $TTL.ToString()
    } | ConvertTo-Json
    
    $createUrl = "$baseUrl/dns/create/$Domain"
    
    try {
        $response = Invoke-RestMethod -Uri $createUrl -Method Post -Body $createBody -ContentType "application/json"
        
        if ($response.status -eq "SUCCESS") {
            Write-Success "$RecordType record created: $Subdomain.$Domain"
            return $true
        }
        else {
            Write-Error "Porkbun API error: $($response.message)"
            return $false
        }
    }
    catch {
        Write-Error "Failed to create DNS record: $($_.Exception.Message)"
        return $false
    }
}

function Set-CustomDomain {
    param([string]$CustomDomain)
    
    Write-Step "Configuring Custom Domain for Backend: $CustomDomain"
    
    # Get domain verification ID
    $verificationId = az containerapp show `
        --name $BACKEND_CONTAINER_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --query "properties.customDomainVerificationId" -o tsv
    
    # Get default domain
    $defaultDomain = az containerapp show `
        --name $BACKEND_CONTAINER_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --query "properties.configuration.ingress.fqdn" -o tsv
    
    if (-not $defaultDomain) {
        Write-Error "Failed to get Container App FQDN"
        return
    }
    
    Write-Info "Target hostname: $defaultDomain"
    
    # Configure DNS records
    $usePorkbun = $UsePorkbunDNS -or $script:UsePorkbunDNS
    if ($usePorkbun) {
        # Parse domain parts: "dev.educatorapp.realityworksai.com" -> subdomain="dev.educatorapp", domain="realityworksai.com"
        $parts = $CustomDomain -split '\.'
        if ($parts.Count -lt 3) {
            Write-Error "Custom domain must be a subdomain (e.g., dev.educatorapp.realityworksai.com)"
            return
        }
        
        $subdomain = $parts[0..($parts.Count - 3)] -join '.'
        $rootDomain = $parts[-2..-1] -join '.'
        
        Write-Info "Root domain: $rootDomain"
        Write-Info "Subdomain: $subdomain"
        
        # Create CNAME record
        $cnameSuccess = Set-PorkbunDNSRecord `
            -Domain $rootDomain `
            -Subdomain $subdomain `
            -RecordType "CNAME" `
            -Content $defaultDomain
        
        if (-not $cnameSuccess) {
            Write-Error "Failed to create CNAME record"
            return
        }
        
        # Create TXT verification record
        $txtSubdomain = "asuid.$subdomain"
        $txtSuccess = Set-PorkbunDNSRecord `
            -Domain $rootDomain `
            -Subdomain $txtSubdomain `
            -RecordType "TXT" `
            -Content $verificationId
        
        if (-not $txtSuccess) {
            Write-Error "Failed to create TXT record"
            return
        }
        
        # Wait for DNS propagation
        Write-Info "Waiting 30 seconds for DNS propagation..."
        Start-Sleep -Seconds 30
    }
    else {
        Write-Host "`nAdd these DNS records:" -ForegroundColor Yellow
        Write-Host "  CNAME: $CustomDomain -> $defaultDomain" -ForegroundColor Cyan
        Write-Host "  TXT: asuid.$CustomDomain -> $verificationId" -ForegroundColor Cyan
        Write-Host "`nTip: Use -UsePorkbunDNS to configure automatically" -ForegroundColor Gray
        
        Read-Host "`nPress Enter after DNS records are configured..."
    }
    
    # Add custom domain to Container App
    Write-Info "Adding custom domain to Container App..."
    az containerapp hostname add `
        --name $BACKEND_CONTAINER_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --hostname $CustomDomain
    
    # Get subscription ID for environment resource ID
    $subscriptionId = az account show --query id -o tsv
    
    # Construct full environment resource ID
    $environmentResourceId = "/subscriptions/$subscriptionId/resourceGroups/$ENVIRONMENT_RESOURCE_GROUP/providers/Microsoft.App/managedEnvironments/$ENVIRONMENT_NAME"
    
    # Bind managed certificate
    Write-Info "Binding managed certificate..."
    az containerapp hostname bind `
        --name $BACKEND_CONTAINER_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --hostname $CustomDomain `
        --environment $environmentResourceId `
        --validation-method CNAME
    
    Write-Success "Custom domain and SSL configured for backend"
}
#endregion

function New-GitHubActionsOIDC {
    <#
    .SYNOPSIS
        Configures OIDC federated credentials for GitHub Actions (no secrets to rotate!)
    
    .DESCRIPTION
        Creates/updates a Service Principal with federated credentials for:
        - Branch pushes (main, qa, dev)
        - Pull requests
        
        This eliminates credential rotation and uses short-lived tokens.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$GitHubOrg,
        [Parameter(Mandatory=$true)]
        [string]$GitHubRepo
    )
    
    Write-Step "Configuring GitHub Actions OIDC Authentication"
    Write-Host "  Repository: ${GitHubOrg}/${GitHubRepo}" -ForegroundColor Cyan
    
    $subscriptionId = az account show --query id -o tsv
    $tenantId = az account show --query tenantId -o tsv
    $spName = "github-actions-sp"
    
    # Check if SP already exists
    $existingSp = az ad sp list --display-name $spName --query "[0].appId" -o tsv 2>$null
    
    if ($existingSp) {
        Write-Host "Service Principal '$spName' already exists (AppId: $existingSp)" -ForegroundColor Yellow
        $appId = $existingSp
    } else {
        Write-Host "Creating new Service Principal '$spName'..." -ForegroundColor Cyan
        $appId = az ad sp create-for-rbac `
            --name $spName `
            --role Contributor `
            --scopes "/subscriptions/$subscriptionId/resourceGroups/ARG-all1-rwai" `
            --query appId -o tsv 2>$null
    }
    
    # Get the App Object ID (needed for federation)
    $appObjectId = az ad app list --display-name $spName --query "[0].id" -o tsv
    
    Write-Step "Configuring Federated Credentials"
    
    # Define federation scenarios
    # Use repo-specific names to avoid conflicts with other repositories
    $repoShortName = ($GitHubRepo -replace "-", "").ToLower()
    
    $federations = @(
        # Environment-based credentials
        @{
            name = "github-${repoShortName}-prod-environment"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:environment:prod"
            description = "GitHub Actions - $GitHubRepo prod environment deployments"
        },
        @{
            name = "github-${repoShortName}-qa-environment"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:environment:qa"
            description = "GitHub Actions - $GitHubRepo qa environment deployments"
        },
        @{
            name = "github-${repoShortName}-dev-environment"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:environment:dev"
            description = "GitHub Actions - $GitHubRepo dev environment deployments"
        },
        # Branch-based credentials (fallback for workflows without environment)
        @{
            name = "github-${repoShortName}-main-branch"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:ref:refs/heads/main"
            description = "GitHub Actions - $GitHubRepo main branch deployments (prod)"
        },
        @{
            name = "github-${repoShortName}-qa-branch"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:ref:refs/heads/qa"
            description = "GitHub Actions - $GitHubRepo qa branch deployments"
        },
        @{
            name = "github-${repoShortName}-dev-branch"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:ref:refs/heads/dev"
            description = "GitHub Actions - $GitHubRepo dev branch deployments"
        },
        @{
            name = "github-${repoShortName}-pull-requests"
            subject = "repo:${GitHubOrg}/${GitHubRepo}:pull_request"
            description = "GitHub Actions - $GitHubRepo pull request previews"
        }
    )
    
    foreach ($fed in $federations) {
        # Check if credential already exists
        $existing = az ad app federated-credential list `
            --id $appObjectId `
            --query "[?name=='$($fed.name)'].name" -o tsv 2>$null
        
        # Build escaped JSON parameters (using escaped strings instead of ConvertTo-Json which fails silently)
        $jsonParams = "{`"name`":`"$($fed.name)`",`"issuer`":`"https://token.actions.githubusercontent.com`",`"subject`":`"$($fed.subject)`",`"description`":`"$($fed.description)`",`"audiences`":[`"api://AzureADTokenExchange`"]}"
        
        if ($existing) {
            Write-Host "  Updating: $($fed.name)" -ForegroundColor Yellow
            az ad app federated-credential update `
                --id $appObjectId `
                --federated-credential-id $($fed.name) `
                --parameters $jsonParams `
                --output none 2>$null
        } else {
            Write-Host "  Creating: $($fed.name)" -ForegroundColor Cyan
            az ad app federated-credential create `
                --id $appObjectId `
                --parameters $jsonParams `
                --output none 2>$null
        }
        Write-Success "  Configured: $($fed.name)"
    }
    
    # Ensure role assignments for all resource groups
    Write-Step "Configuring Role Assignments"
    
    $resourceGroups = @(
        "ARG-all1-rwai",      # Shared resources (ACR, CAE, Log Analytics)
        "ARG-dev1-rwai",      # Dev environment
        "ARG-qa1-rwai",       # QA environment
        "ARG-prod1-rwai"      # Production environment
    )
    
    foreach ($rg in $resourceGroups) {
        $rgExists = az group exists --name $rg 2>$null
        if ($rgExists -eq "true") {
            Write-Host "  Adding Contributor role for $rg..." -ForegroundColor Cyan
            az role assignment create `
                --assignee $appId `
                --role Contributor `
                --scope "/subscriptions/$subscriptionId/resourceGroups/$rg" `
                --output none 2>$null
            Write-Success "  Role assigned for $rg"
        } else {
            Write-Warning "  Resource group $rg does not exist (will be created during provision)"
        }
    }
    
    # Add AcrPush role for container registry
    Write-Host "  Adding AcrPush role for container registry..." -ForegroundColor Cyan
    $acrId = az acr show --name acrall1rwai --query id -o tsv 2>$null
    if ($acrId) {
        az role assignment create `
            --assignee $appId `
            --role AcrPush `
            --scope $acrId `
            --output none 2>$null
        Write-Success "  AcrPush role assigned"
    } else {
        Write-Warning "  ACR 'acrall1rwai' not found"
    }
    
    # Output GitHub configuration
    Write-Host "`n" -NoNewline
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  OIDC Configuration Complete!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "GitHub Repository Secrets Required:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  AZURE_CLIENT_ID:       $appId" -ForegroundColor White
    Write-Host "  AZURE_TENANT_ID:       $tenantId" -ForegroundColor White
    Write-Host "  AZURE_SUBSCRIPTION_ID: $subscriptionId" -ForegroundColor White
    Write-Host ""
    
    # Check if GitHub CLI is available and offer to set secrets automatically
    $ghInstalled = Get-Command gh -ErrorAction SilentlyContinue
    if ($ghInstalled) {
        # Verify gh is authenticated
        $ghAuth = gh auth status 2>&1
        if ($LASTEXITCODE -eq 0) {
            $setSecrets = Read-Host "Set GitHub secrets automatically using gh CLI? (Y/n)"
            if ($setSecrets -ne "n" -and $setSecrets -ne "N") {
                Write-Step "Setting GitHub Secrets"
                
                $repoPath = "${GitHubOrg}/${GitHubRepo}"
                
                # Define environments that use OIDC
                $environments = @("dev", "qa", "prod")
                
                foreach ($env in $environments) {
                    Write-Host "`n  Configuring environment: $env" -ForegroundColor Cyan
                    
                    # Ensure environment exists
                    $envExists = gh api "repos/$repoPath/environments/$env" 2>$null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "    Creating environment $env..." -ForegroundColor Yellow
                        gh api --method PUT "repos/$repoPath/environments/$env" 2>$null | Out-Null
                    }
                    
                    Write-Host "    Setting AZURE_CLIENT_ID..." -ForegroundColor Gray
                    gh secret set AZURE_CLIENT_ID --env $env --repo $repoPath --body $appId 2>$null
                    if ($LASTEXITCODE -eq 0) { Write-Success "    AZURE_CLIENT_ID set" } else { Write-Error "    Failed to set AZURE_CLIENT_ID" }
                    
                    Write-Host "    Setting AZURE_TENANT_ID..." -ForegroundColor Gray
                    gh secret set AZURE_TENANT_ID --env $env --repo $repoPath --body $tenantId 2>$null
                    if ($LASTEXITCODE -eq 0) { Write-Success "    AZURE_TENANT_ID set" } else { Write-Error "    Failed to set AZURE_TENANT_ID" }
                    
                    Write-Host "    Setting AZURE_SUBSCRIPTION_ID..." -ForegroundColor Gray
                    gh secret set AZURE_SUBSCRIPTION_ID --env $env --repo $repoPath --body $subscriptionId 2>$null
                    if ($LASTEXITCODE -eq 0) { Write-Success "    AZURE_SUBSCRIPTION_ID set" } else { Write-Error "    Failed to set AZURE_SUBSCRIPTION_ID" }
                }
                
                # Also set at repo level for pull_request events (no environment context)
                Write-Host "`n  Setting repository-level secrets (for PR workflows)..." -ForegroundColor Cyan
                gh secret set AZURE_CLIENT_ID --repo $repoPath --body $appId 2>$null
                gh secret set AZURE_TENANT_ID --repo $repoPath --body $tenantId 2>$null
                gh secret set AZURE_SUBSCRIPTION_ID --repo $repoPath --body $subscriptionId 2>$null
                Write-Success "  Repository-level secrets set"
                
                Write-Host ""
                Write-Success "GitHub secrets configured for all environments! OIDC authentication is ready."
            }
        } else {
            Write-Warning "GitHub CLI not authenticated. Run 'gh auth login' first, or set secrets manually."
        }
    } else {
        Write-Host "Tip: Install GitHub CLI ('gh') to set secrets automatically next time." -ForegroundColor Gray
        Write-Host "     https://cli.github.com/" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Benefits of OIDC:" -ForegroundColor Cyan
    Write-Host "  - No secrets to rotate (ever!)" -ForegroundColor White
    Write-Host "  - No credential expiration" -ForegroundColor White
    Write-Host "  - More secure (short-lived tokens)" -ForegroundColor White
    Write-Host ""
    Write-Host "Federated credentials configured for:" -ForegroundColor Cyan
    foreach ($fed in $federations) {
        Write-Host "  - $($fed.description)" -ForegroundColor White
    }
}
#endregion

#region ==================== CONTAINER APP PROBE CONFIGURATION ====================

function Set-ContainerAppHealthProbes {
    <#
    .SYNOPSIS
        Configure health probes for a container app using YAML template.
        This allows proper configuration of liveness and readiness probes.
    #>
    param(
        [string]$ContainerAppName,
        [string]$ResourceGroup,
        [int]$Port = 3000,
        [string]$ProbeEndpoint = "/health"
    )
    
    try {
        Write-Step "Configuring Health Probes for $ContainerAppName"
        
        # Get current image from the container app so we can include it in YAML
        $currentApp = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
        $currentImage = $currentApp.properties.template.containers[0].image
        
        if (-not $currentImage) {
            Write-Warning "Could not retrieve current image for container app. Skipping probe configuration."
            return
        }
        
        Write-Info "Current image: $currentImage"
        
        # Create YAML template with health probes (must include image property)
        $yamlTemplate = @"
properties:
  template:
    containers:
      - name: $ContainerAppName
        image: $currentImage
        probes:
          - type: Liveness
            httpGet:
              path: $ProbeEndpoint
              port: $Port
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          - type: Readiness
            httpGet:
              path: $ProbeEndpoint
              port: $Port
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
"@
        
        $yamlFile = Join-Path $PSScriptRoot "containerapp-probes-$([System.IO.Path]::GetRandomFileName()).yaml"
        $yamlTemplate | Out-File $yamlFile -Encoding utf8 -Force
        
        # Apply probe configuration via YAML
        az containerapp update `
            --name $ContainerAppName `
            --resource-group $ResourceGroup `
            --yaml $yamlFile | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Health probes configured successfully"
            Write-Info "  Liveness: HTTP GET $ProbeEndpoint (30s delay, 10s period, 3 failures)"
            Write-Info "  Readiness: HTTP GET $ProbeEndpoint (10s delay, 5s period, 2 failures)"
        } else {
            Write-Error "Failed to configure health probes"
        }
        
        # Clean up temp file
        Remove-Item $yamlFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Warning "Error configuring health probes: $_"
    }
}

function Set-ContainerAppEnvAndSecrets {
    <#
    .SYNOPSIS
        Bind Key Vault secrets and environment variables from container-spec.json
        to a Container App. Uses the container app's system-assigned managed
        identity to reference secrets stored in Key Vault.
    .DESCRIPTION
        For each entry in $EnvSpec.secrets, creates a container app secret that
        references a Key Vault secret (via keyvaulturl + system identity). The
        env var name is mapped to the Key Vault secret name by replacing
        underscores with hyphens (e.g. DB_PASSWORD -> DB-PASSWORD).
        For each entry in $EnvSpec.'env-vars', sets the env var directly.
        Secret-backed env vars are added as secretref:<name>.
    #>
    param(
        [string]$ContainerAppName,
        [string]$ResourceGroup,
        [string]$KeyVaultName,
        [PSCustomObject]$EnvSpec
    )

    if (-not $EnvSpec) {
        Write-Warning "No container spec provided; skipping env/secret binding."
        return
    }

    try {
        Write-Step "Binding env vars and Key Vault secrets to $ContainerAppName"

        $kvBaseUri = "https://$KeyVaultName.vault.azure.net"
        $envVarPairs = @()

        # ---- Secrets: bind Key Vault references via system-assigned identity ----
        $secretPairs = @()
        $secretEnvPairs = @()
        if ($EnvSpec.PSObject.Properties.Name -contains 'secrets' -and $EnvSpec.secrets) {
            foreach ($prop in $EnvSpec.secrets.PSObject.Properties) {
                $envVarName    = $prop.Name                          # e.g. DB_PASSWORD
                $secretRefName = $prop.Value                         # e.g. db-password
                $kvSecretName  = $envVarName -replace '_', '-'       # e.g. DB-PASSWORD
                $kvSecretUrl   = "$kvBaseUri/secrets/$kvSecretName"

                $secretPairs    += "$secretRefName=keyvaultref:$kvSecretUrl,identityref:system"
                $secretEnvPairs += "$envVarName=secretref:$secretRefName"
            }
        }

        if ($secretPairs.Count -gt 0) {
            Write-Info "Binding $($secretPairs.Count) Key Vault secret(s)..."
            az containerapp secret set `
                --name $ContainerAppName `
                --resource-group $ResourceGroup `
                --secrets $secretPairs | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Key Vault secrets bound to container app"
            } else {
                Write-Warning "Failed to bind one or more Key Vault secrets (exit $LASTEXITCODE)"
            }
        } else {
            Write-Info "No secrets defined in container spec."
        }

        # ---- Plain env vars ----
        if ($EnvSpec.PSObject.Properties.Name -contains 'env-vars' -and $EnvSpec.'env-vars') {
            foreach ($prop in $EnvSpec.'env-vars'.PSObject.Properties) {
                $envVarPairs += "$($prop.Name)=$($prop.Value)"
            }
        }

        # Combine plain env vars + secret-backed env vars
        $allEnvPairs = @()
        $allEnvPairs += $envVarPairs
        $allEnvPairs += $secretEnvPairs

        if ($allEnvPairs.Count -gt 0) {
            Write-Info "Setting $($allEnvPairs.Count) environment variable(s)..."
            az containerapp update `
                --name $ContainerAppName `
                --resource-group $ResourceGroup `
                --set-env-vars $allEnvPairs | Out-Null

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Environment variables set on container app"
            } else {
                Write-Warning "Failed to set one or more environment variables (exit $LASTEXITCODE)"
            }
        } else {
            Write-Info "No environment variables defined in container spec."
        }
    }
    catch {
        Write-Warning "Error binding env vars/secrets: $_"
    }
}

#endregion

#region ==================== MAIN LOGIC ====================

Write-Host "
╔══════════════════════════════════════════════════════════════╗
║       Educator App - Backend Deployment                     ║
║       Environment: $Environment | Action: $Action                     ║
╚══════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

Test-AzureLogin

# Get subscription ID for resource references
$SUBSCRIPTION_ID = (az account show --query id -o tsv)
$ENVIRONMENT_RESOURCE_ID = "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$ENVIRONMENT_RESOURCE_GROUP/providers/Microsoft.App/managedEnvironments/$ENVIRONMENT_NAME"

switch ($Action) {
    "provision" {
        Write-Step "PROVISIONING BACKEND INFRASTRUCTURE FOR $($Environment.ToUpper())"
        
        Write-Info "Resource Group: $RESOURCE_GROUP"
        Write-Info "Container App: $BACKEND_CONTAINER_APP_NAME"
        Write-Info "Container Registry: $CONTAINERREGISTRY_NAME (shared)"
        Write-Info "PostgreSQL Server: $DB_SERVER_NAME"
        Write-Info "PostgreSQL Database: $DB_NAME"
        Write-Info "Key Vault: $KEY_VAULT_NAME"
        Write-Info "Log Analytics: $LOG_ANALYTICS_NAME (shared)"
        
        # 1. Verify Resource Group exists
        Write-Step "Verifying Resource Group"
        if (Test-AzResourceGroupExists -ResourceGroupName $RESOURCE_GROUP) {
            Write-Success "Resource Group '$RESOURCE_GROUP' exists"
        } else {
            Write-Error "Resource Group '$RESOURCE_GROUP' does not exist"
            Write-Warning "Please provision the frontend infrastructure first using Deploy-EducatorApp.ps1"
            exit 1
        }
        
        # 2. Verify Key Vault exists
        Write-Step "Verifying Key Vault"
        if (Test-AzKeyVaultExists -KeyVaultName $KEY_VAULT_NAME) {
            Write-Success "Key Vault '$KEY_VAULT_NAME' exists"
        } else {
            Write-Error "Key Vault '$KEY_VAULT_NAME' does not exist"
            Write-Warning "Please provision using Deploy-EducatorApp.ps1 first"
            exit 1
        }
        
        # 2.5 Verify Container Apps Environment exists

            # Allow Azure-internal services (Container Apps, etc.) to reach Postgres.
            # The 0.0.0.0/0.0.0.0 sentinel is the Azure-documented "Allow public access
            # from any Azure service within Azure to this server" rule. Required so the
            # Container App revisions can connect to the flexible server.
            $existingAzureRule = az postgres flexible-server firewall-rule show `
                --name "AllowAllAzureServices" `
                --server-name $DB_SERVER_NAME `
                --resource-group $RESOURCE_GROUP 2>$null
            if ($existingAzureRule) {
                Write-Success "Firewall rule 'AllowAllAzureServices' already exists"
            } else {
                Write-Info "Adding firewall rule to allow Azure services (0.0.0.0)"
                az postgres flexible-server firewall-rule create `
                    --name "AllowAllAzureServices" `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --start-ip-address "0.0.0.0" `
                    --end-ip-address "0.0.0.0" 2>$null
                Write-Success "Firewall rule created: AllowAllAzureServices"
            }
        Write-Step "Verifying Container Apps Environment"
        if (Test-AzResourceExists -ResourceGroupName $ENVIRONMENT_RESOURCE_GROUP -ResourceName $ENVIRONMENT_NAME -ResourceType "Microsoft.App/managedEnvironments") {
            Write-Success "Container Apps Environment '$ENVIRONMENT_NAME' exists"
            
            # Verify Log Analytics workspace exists (in shared resource group)
            if (Test-AzLogAnalyticsWorkspaceExists -ResourceGroupName $ALL_RESOURCE_GROUP -WorkspaceName $LOG_ANALYTICS_NAME) {
                Write-Success "Log Analytics workspace '$LOG_ANALYTICS_NAME' exists in $ALL_RESOURCE_GROUP"
            } else {
                Write-Warning "Log Analytics workspace '$LOG_ANALYTICS_NAME' not found in $ALL_RESOURCE_GROUP (environment may not have proper logging)"
            }
        } else {
            Write-Info "Container Apps Environment '$ENVIRONMENT_NAME' does not exist - creating..."
            
            # Get Log Analytics workspace ID for AEN
            $lawCustomerId = az monitor log-analytics workspace show `
                --resource-group $ALL_RESOURCE_GROUP `
                --workspace-name $LOG_ANALYTICS_NAME `
                --query customerId -o tsv 2>$null
            
            $lawKey = az monitor log-analytics workspace get-shared-keys `
                --resource-group $ALL_RESOURCE_GROUP `
                --workspace-name $LOG_ANALYTICS_NAME `
                --query primarySharedKey -o tsv 2>$null
            
            if ($lawCustomerId -and $lawKey) {
                Write-Info "Creating Container Apps Environment with Log Analytics integration..."
                $aenOutput = az containerapp env create `
                    --name $ENVIRONMENT_NAME `
                    --resource-group $ENVIRONMENT_RESOURCE_GROUP `
                    --location "East US" `
                    --logs-workspace-id $lawCustomerId `
                    --logs-workspace-key $lawKey 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Container Apps Environment '$ENVIRONMENT_NAME' created"
                } else {
                    Write-Error "Failed to create Container Apps Environment: $aenOutput"
                    exit 1
                }
            } else {
                Write-Error "Could not retrieve Log Analytics workspace credentials"
                Write-Error "Ensure '$LOG_ANALYTICS_NAME' exists in '$ALL_RESOURCE_GROUP'"
                exit 1
            }
        }
        
        # 3. Verify Container Registry exists (shared resource)
        Write-Step "Verifying Container Registry"
        if (Test-AzContainerRegistryExists -RegistryName $CONTAINERREGISTRY_NAME) {
            Write-Success "Container Registry '$CONTAINERREGISTRY_NAME' exists"
            
            # Resolve actual login server (ACR has unique suffix, must query)
            $script:ACR_LOGIN_SERVER = az acr show --name $CONTAINERREGISTRY_NAME --resource-group $ALL_RESOURCE_GROUP --query loginServer -o tsv 2>$null
            if ($ACR_LOGIN_SERVER) {
                Write-Info "ACR Login Server: $ACR_LOGIN_SERVER"
            } else {
                Write-Error "Could not resolve ACR login server for '$CONTAINERREGISTRY_NAME'"
                Write-Error "ACR login servers have unique suffixes - cannot use default pattern"
                exit 1
            }
        } else {
            Write-Error "Container Registry '$CONTAINERREGISTRY_NAME' does not exist"
            Write-Warning "Please provision the frontend infrastructure first using Deploy-EducatorApp.ps1"
            exit 1
        }
        
        # 5. Create / Verify PostgreSQL Server
        Write-Step "Creating/Verifying PostgreSQL Flexible Server"
        $PostgresCreatedThisRun = $false
        
        if (Test-AzPostgresServerExists -ServerName $DB_SERVER_NAME -ResourceGroupName $RESOURCE_GROUP) {
            Write-Success "PostgreSQL Server '$DB_SERVER_NAME' already exists"
        } else {
            Write-Info "Creating PostgreSQL Flexible Server: $DB_SERVER_NAME"
            try {
                # Generate secure password if not provided (alphanumeric only to avoid shell parsing issues)
                if (-not $env:DB_PASSWORD) {
                    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                    $env:DB_PASSWORD = -join (1..20 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
                    Write-Info "Generated secure password for PostgreSQL admin"
                }
                
                $pgOutput = az postgres flexible-server create `
                    --name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --location $LOCATION `
                    --admin-user $DB_USER `
                    --admin-password $env:DB_PASSWORD `
                    --sku-name Standard_B1ms `
                    --tier Burstable `
                    --storage-size 32 `
                    --version 15 `
                    --yes `
                    --query fqdn -o tsv 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "PostgreSQL Server created: $DB_SERVER_NAME"
                    Write-Success "Server FQDN: $pgOutput"
                    $PostgresCreatedThisRun = $true
                    
                    # For dev/qa environments, allow non-SSL connections
                    if ($Environment -ne "prod") {
                        Write-Info "Disabling SSL requirement for $Environment environment (for development convenience)"
                        az postgres flexible-server parameter set `
                            --server-name $DB_SERVER_NAME `
                            --resource-group $RESOURCE_GROUP `
                            --name "require_secure_transport" `
                            --value "OFF" 2>$null
                        Write-Success "SSL requirement disabled"
                    }
                } else {
                    Write-Error "Failed to create PostgreSQL Server: $pgOutput"
                }
            }
            catch {
                Write-Error "Error creating PostgreSQL Server: $_"
            }
        }
        
        # 5.1 Configure PostgreSQL Firewall Rule
        Write-Step "Configuring PostgreSQL Firewall"
        try {
            # Get current public IP
            Write-Info "Detecting your public IP address..."
            $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -UseBasicParsing -ErrorAction Stop | ConvertFrom-Json).ip
            Write-Info "Your public IP: $myIp"
            
            # Check if rule already exists with correct IP
            $existingRule = az postgres flexible-server firewall-rule show `
                --name "AllowMyIP" `
                --server-name $DB_SERVER_NAME `
                --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            
            if ($existingRule -and $existingRule.startIpAddress -eq $myIp) {
                Write-Success "Firewall rule 'AllowMyIP' already exists for $myIp"
            } else {
                # Create or update firewall rule for current IP
                Write-Info "Adding firewall rule for IP: $myIp"
                az postgres flexible-server firewall-rule create `
                    --name "AllowMyIP" `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --start-ip-address $myIp `
                    --end-ip-address $myIp 2>$null
                Write-Success "Firewall rule created for your IP: $myIp"
            }
        } catch {
            Write-Warning "Could not auto-configure firewall rule: $_"
            Write-Info "Please manually add your public IP to PostgreSQL firewall rules"
        }
        
        # 6. Create / Verify PostgreSQL Database
        Write-Step "Creating/Verifying PostgreSQL Database"
        if (Test-AzPostgresDatabaseExists -ServerName $DB_SERVER_NAME -DatabaseName $DB_NAME -ResourceGroupName $RESOURCE_GROUP) {
            Write-Success "PostgreSQL Database '$DB_NAME' already exists"
        } else {
            Write-Info "Creating PostgreSQL Database: $DB_NAME"
            try {
                $dbOutput = az postgres flexible-server db create `
                    --server-name $DB_SERVER_NAME `
                    --name $DB_NAME `
                    --resource-group $RESOURCE_GROUP 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "PostgreSQL Database created: $DB_NAME"
                } else {
                    Write-Error "Failed to create PostgreSQL Database: $dbOutput"
                }
            }
            catch {
                Write-Error "Error creating PostgreSQL Database: $_"
            }
        }
        
        # 6.5 Ensure Database Password is Stored in Key Vault (idempotent)
        Write-Step "Ensuring Database Password is Stored in Key Vault"
        
        # If password not in env, try to retrieve from Key Vault
        if (-not $env:DB_PASSWORD) {
            Write-Info "Attempting to retrieve existing password from Key Vault..."
            try {
                $existingSecret = az keyvault secret show --vault-name $KEY_VAULT_NAME --name "DB-PASSWORD" 2>$null | ConvertFrom-Json
                if ($existingSecret) {
                    $env:DB_PASSWORD = $existingSecret.value
                    Write-Success "Retrieved password from Key Vault"
                }
            } catch {
                # Password not in Key Vault either
            }
        }
        
        # If we have a password (either from creation or from Key Vault), store/update it
        if ($env:DB_PASSWORD) {
            try {
                az keyvault secret set --vault-name $KEY_VAULT_NAME --name "DB-PASSWORD" --value $env:DB_PASSWORD | Out-Null
                Write-Success "Database password stored/verified in Key Vault: $KEY_VAULT_NAME/DB-PASSWORD"
            } catch {
                Write-Warning "Could not store password in Key Vault: $_"
                if ($PostgresCreatedThisRun) {
                    Write-Warning "⚠️  Save this password securely: $env:DB_PASSWORD"
                }
            }
        } else {
            Write-Warning "No database password available. Provide password and run:"
            Write-Info "  `$env:DB_PASSWORD = 'your-password'; .\Deploy-Backend.ps1 -Environment $Environment -Action provision"
        }
        
        # 7. Create / Verify Backend Container App
        Write-Step "Creating/Verifying Backend Container App"
        
        # Display container specifications from config
        if ($EnvContainerSpec) {
            Write-Info "Container Specifications (from .deployment/container-spec.json):"
            Write-Info "  CPU: $Container_CPU"
            Write-Info "  Memory: $Container_Memory"
            Write-Info "  Min Replicas: $Container_MinReplicas"
            Write-Info "  Max Replicas: $Container_MaxReplicas"
            Write-Info "  Reason: $($EnvContainerSpec.reason)"
        } else {
            Write-Warning "Using default specifications (config file not found)"
            Write-Info "  CPU: $Container_CPU (default)"
            Write-Info "  Memory: $Container_Memory (default)"
        }
        
        if (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME) {
            Write-Success "Backend Container App '$BACKEND_CONTAINER_APP_NAME' already exists"
            Write-Info "Container App is ready for deployment. Push to '$Environment' branch to trigger GitHub Actions deployment."
            
            # Ensure Key Vault access is configured for existing container app
            Write-Step "Verifying Key Vault Access for Container App"
            try {
                $caIdentity = az containerapp identity show `
                    --name $BACKEND_CONTAINER_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --query principalId -o tsv 2>$null
                
                if ($caIdentity) {
                    Write-Info "Container App Principal ID: $caIdentity"
                    $kvResourceId = az keyvault show --name $KEY_VAULT_NAME --query id -o tsv 2>$null
                    
                    if ($kvResourceId) {
                        # Check if role assignment already exists
                        $existingRole = az role assignment list `
                            --assignee-object-id $caIdentity `
                            --scope $kvResourceId `
                            --role "Key Vault Secrets User" `
                            --query "[0].id" -o tsv 2>$null
                        
                        if ($existingRole) {
                            Write-Success "Container App already has Key Vault Secrets User role"
                        } else {
                            Write-Info "Assigning Key Vault Secrets User role to Container App..."
                            az role assignment create `
                                --role "Key Vault Secrets User" `
                                --assignee-object-id $caIdentity `
                                --scope $kvResourceId `
                                --assignee-principal-type ServicePrincipal 2>$null
                            Write-Success "Container App now has Key Vault Secrets User role"
                        }
                    }
                } else {
                    Write-Warning "Could not verify Key Vault access for existing container app"
                }
            }
            catch {
                Write-Warning "Could not verify Key Vault access: $_"
            }
        } else {
            Write-Info "Creating Backend Container App: $BACKEND_CONTAINER_APP_NAME"
            try {
                # Step 1: Create container app with placeholder image (to get identity first)
                Write-Info "Step 1: Creating container app with placeholder image..."
                $caOutput = az containerapp create `
                    --name $BACKEND_CONTAINER_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --environment $ENVIRONMENT_RESOURCE_ID `
                    --image "mcr.microsoft.com/k8se/quickstart:latest" `
                    --cpu $Container_CPU `
                    --memory $Container_Memory `
                    --min-replicas $Container_MinReplicas `
                    --max-replicas $Container_MaxReplicas `
                    --target-port $BACKEND_API_PORT `
                    --ingress external `
                    --system-assigned `
                    --query properties.configuration.ingress.fqdn -o tsv 2>&1
                
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to create container app: $caOutput"
                }
                Write-Success "Container app created with placeholder image"
                
                # Step 2: Get container app identity and assign AcrPull role
                Write-Info "Step 2: Configuring ACR access..."
                $caIdentity = az containerapp identity show `
                    --name $BACKEND_CONTAINER_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --query principalId -o tsv 2>$null
                
                if ($caIdentity) {
                    # Get ACR resource ID using the ACR name (not login server)
                    $acrResourceId = az acr show --name $CONTAINERREGISTRY_NAME --resource-group $ALL_RESOURCE_GROUP --query id -o tsv 2>$null
                    if ($acrResourceId) {
                        Write-Info "Assigning AcrPull role to container app identity..."
                        az role assignment create `
                            --role "AcrPull" `
                            --assignee-object-id $caIdentity `
                            --scope $acrResourceId `
                            --assignee-principal-type ServicePrincipal 2>$null
                        Write-Success "AcrPull role assigned"
                    } else {
                        Write-Warning "Could not get ACR resource ID for '$CONTAINERREGISTRY_NAME'"
                    }
                } else {
                    Write-Warning "Could not get container app identity"
                }
                
                # Step 3: Configure registry and update image
                Write-Info "Step 3: Configuring ACR registry and updating image..."
                az containerapp registry set `
                    --name $BACKEND_CONTAINER_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --server $ACR_LOGIN_SERVER `
                    --identity system 2>$null
                
                # Wait a moment for role propagation
                Write-Info "Waiting for role propagation (30 seconds)..."
                Start-Sleep -Seconds 30
                
                # Update with actual image
                $updateResult = az containerapp update `
                    --name $BACKEND_CONTAINER_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --image "${ACR_LOGIN_SERVER}/${BACKEND_IMAGE_NAME}:${Environment}-latest" `
                    --query properties.configuration.ingress.fqdn -o tsv 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    $caOutput = $updateResult
                    Write-Success "Backend Container App created: $BACKEND_CONTAINER_APP_NAME"
                    Write-Success "API FQDN: $caOutput"
                    Write-Info "Resources: $Container_CPU CPU, $Container_Memory RAM"
                    Write-Info "Replicas: $Container_MinReplicas-$Container_MaxReplicas"
                    Write-Info "Health endpoint: https://$caOutput$BACKEND_HEALTH_ENDPOINT"
                } else {
                    Write-Warning "Container app created but image update failed. The GitHub workflow will update the image on next deploy."
                    Write-Warning "Error: $updateResult"
                    # Still mark as success since the container app exists
                    $caOutput = az containerapp show --name $BACKEND_CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv 2>$null
                    Write-Success "Backend Container App created: $BACKEND_CONTAINER_APP_NAME"
                    Write-Success "API FQDN: $caOutput"
                }
                    
                # Configure Key Vault access for container app
                Write-Step "Configuring Key Vault Access for Container App"
                # Identity already retrieved in step 2, use same variable
                if ($caIdentity) {
                    $kvResourceId = az keyvault show --name $KEY_VAULT_NAME --query id -o tsv 2>$null
                    
                    if ($kvResourceId) {
                        # Assign Key Vault Secrets User role
                        Write-Info "Assigning Key Vault Secrets User role to Container App..."
                        az role assignment create `
                            --role "Key Vault Secrets User" `
                            --assignee-object-id $caIdentity `
                            --scope $kvResourceId `
                            --assignee-principal-type ServicePrincipal 2>$null
                        
                        Write-Success "Container App can now read secrets from Key Vault"
                    } else {
                        Write-Warning "Could not find Key Vault resource ID"
                    }
                } else {
                    Write-Warning "Could not retrieve Container App identity. Manual Key Vault access configuration may be needed."
                }
            }
            catch {
                Write-Error "Error creating Backend Container App: $_"
            }
        }
        
        # NOTE: Health probes are configured by the GitHub Actions workflow after deploying the actual image.
        # Configuring probes here with the placeholder image (mcr.microsoft.com/k8se/quickstart:latest) would fail.
        # See .github/workflows/deploy-backend.yml for probe configuration.

        # Bind Key Vault secrets and environment variables from container-spec.json to the Container App
        if (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME) {
            Set-ContainerAppEnvAndSecrets `
                -ContainerAppName $BACKEND_CONTAINER_APP_NAME `
                -ResourceGroup $RESOURCE_GROUP `
                -KeyVaultName $KEY_VAULT_NAME `
                -EnvSpec $EnvContainerSpec
        }

        # Create Azure Blob Storage container if it does not exist
        Write-Step "Ensuring Azure Blob Storage Container Exists"
        try {
            # Resolve connection string: prefer env var, then Key Vault
            $blobConnStr = $env:AZURE_STORAGE_CONNECTION_STRING
            if (-not $blobConnStr) {
                Write-Info "AZURE_STORAGE_CONNECTION_STRING not in env — retrieving from Key Vault..."
                $kvBlobSecret = az keyvault secret show `
                    --vault-name $KEY_VAULT_NAME `
                    --name "AZURE-STORAGE-CONNECTION-STRING" 2>$null | ConvertFrom-Json
                if ($kvBlobSecret -and $kvBlobSecret.value) {
                    $blobConnStr = $kvBlobSecret.value
                    Write-Success "Retrieved connection string from Key Vault"
                }
            }

            if ($blobConnStr) {
                # Resolve container name: prefer env var, then container-spec env-vars, then default
                $blobContainer = $env:AZURE_STORAGE_CONTAINER
                if (-not $blobContainer -and $EnvContainerSpec -and $EnvContainerSpec.'env-vars') {
                    $blobContainer = $EnvContainerSpec.'env-vars'.AZURE_STORAGE_CONTAINER
                }
                if (-not $blobContainer) { $blobContainer = "profile-pictures" }

                Write-Info "Storage container: $blobContainer"

                $existingContainer = az storage container exists `
                    --name $blobContainer `
                    --connection-string $blobConnStr `
                    --query exists -o tsv 2>$null

                if ($existingContainer -eq "true") {
                    Write-Success "Blob container '$blobContainer' already exists — ensuring public blob access..."
                    az storage container set-permission `
                        --name $blobContainer `
                        --connection-string $blobConnStr `
                        --public-access blob 2>$null | Out-Null

                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "Blob container '$blobContainer' access level set to public blob"
                    } else {
                        Write-Warning "Could not set public access on '$blobContainer' — check storage account 'Allow Blob anonymous access' setting"
                    }
                } else {
                    Write-Info "Creating blob container '$blobContainer'..."
                    az storage container create `
                        --name $blobContainer `
                        --connection-string $blobConnStr `
                        --public-access blob 2>$null | Out-Null

                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "Blob container '$blobContainer' created with public blob access"
                    } else {
                        Write-Warning "Failed to create blob container '$blobContainer' — it may be created automatically on first upload"
                    }
                }
            } else {
                Write-Warning "Azure Storage connection string not found — skipping container creation"
                Write-Info "Set AZURE_STORAGE_CONNECTION_STRING env var or run '-Action secrets' first"
            }
        } catch {
            Write-Warning "Error ensuring blob container exists: $_"
        }

        Write-Success "Backend infrastructure provisioning check complete!"
        Write-Info "Next steps: Run 'Deploy-Backend.ps1 -Environment $Environment -Action migrate' to run database migrations"
    }
    
    "migrate" {
        Write-Step "RUNNING DATABASE MIGRATIONS FOR $($Environment.ToUpper())"
        
        # Change to repo root directory for npm commands
        $repoRoot = Split-Path -Parent $PSScriptRoot
        Push-Location $repoRoot
        Write-Info "Working directory: $(Get-Location)"
        
        Write-Info "PostgreSQL Database: $DB_NAME on $DB_SERVER_NAME"
        
        # Verify PostgreSQL Database exists before attempting migrations
        if (-not (Test-AzPostgresDatabaseExists -ServerName $DB_SERVER_NAME -DatabaseName $DB_NAME -ResourceGroupName $RESOURCE_GROUP)) {
            Write-Error "Database '$DB_NAME' does not exist. Run provision action first."
            exit 1
        }
        
        Write-Success "Database '$DB_NAME' verified"
        
        # Ensure required Postgres extensions are on the server's allow-list before migrations run.
        Write-Step "Verifying Postgres extension allow-list"
        Set-PostgresExtensionAllowList -ServerName $DB_SERVER_NAME -ResourceGroupName $RESOURCE_GROUP
        
        # Ensure SSL requirement is disabled for dev/qa (already done on creation, but verify for existing servers)
        if ($Environment -ne "prod") {
            Write-Info "Ensuring non-SSL connections are allowed for $Environment environment..."
            try {
                az postgres flexible-server parameter set `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --name "require_secure_transport" `
                    --value "OFF" 2>$null
                Write-Success "SSL requirement configuration verified"
            } catch {
                Write-Warning "Could not verify SSL configuration: $_"
            }
        }
        
        # Ensure PostgreSQL firewall allows current IP
        Write-Step "Verifying PostgreSQL firewall access"
        try {
            $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -ErrorAction Stop | ConvertFrom-Json).ip
            Write-Info "Your public IP: $myIp"
            
            # Check if AllowMyIP rule already exists with correct IP
            $existingRule = az postgres flexible-server firewall-rule show `
                --name "AllowMyIP" `
                --server-name $DB_SERVER_NAME `
                --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            
            if ($existingRule -and $existingRule.startIpAddress -eq $myIp) {
                Write-Success "Firewall rule 'AllowMyIP' already exists for $myIp"
            } else {
                Write-Info "Adding/updating firewall rule for your IP..."
                az postgres flexible-server firewall-rule create `
                    --name "AllowMyIP" `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --start-ip-address $myIp `
                    --end-ip-address $myIp 2>$null
                Write-Success "Firewall rule created/updated for $myIp"
            }
        } catch {
            Write-Warning "Could not verify/configure firewall: $_"
            Write-Warning "If migrations fail, manually add your IP to PostgreSQL firewall rules"
        }
        
        # Retrieve database password from Key Vault and set environment variables
        Write-Step "Setting up database connection environment"
        try {
            # Always retrieve fresh password from Key Vault for migrations
            Write-Info "Retrieving database password from Key Vault..."
            $kvSecret = az keyvault secret show --vault-name $KEY_VAULT_NAME --name "DB-PASSWORD" 2>$null | ConvertFrom-Json
            if ($kvSecret -and $kvSecret.value) {
                $env:DB_PASSWORD = $kvSecret.value
                Write-Success "Retrieved password from Key Vault (length: $($env:DB_PASSWORD.Length) chars)"
            } else {
                Write-Error "Failed to retrieve password from Key Vault or password is empty"
                Pop-Location
                exit 1
            }
            
            # Get database FQDN
            $pgServer = az postgres flexible-server show --name $DB_SERVER_NAME --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            $env:DB_HOST = $pgServer.fullyQualifiedDomainName
            $env:DB_PORT = "5432"
            $env:DB_USERNAME = $DB_USER
            $env:DB_NAME = $DB_NAME
            
            # Create .env file for migrations  
            Write-Info "Creating .env file for TypeORM..."
            $envContent = @"
DB_HOST=$($env:DB_HOST)
DB_PORT=$($env:DB_PORT)
DB_USERNAME=$($env:DB_USERNAME)
DB_PASSWORD=$($env:DB_PASSWORD)
DB_NAME=$($env:DB_NAME)
NODE_ENV=$Environment
"@
            Set-Content -Path ".env" -Value $envContent -Encoding UTF8
            Write-Success ".env file created"
            
            Write-Success "Database connection environment variables set"
            Write-Info "  DB_HOST: $($env:DB_HOST)"
            Write-Info "  DB_PORT: $($env:DB_PORT)"
            Write-Info "  DB_USERNAME: $($env:DB_USERNAME)"
            Write-Info "  DB_NAME: $($env:DB_NAME)"
        } catch {
            Write-Error "Failed to set up database connection: $_"
            Pop-Location
            exit 1
        }
        
        # Ensure dependencies are installed
        Write-Step "Installing dependencies"
        if (-not (Test-Path "node_modules")) {
            Write-Info "node_modules not found, installing dependencies..."
            npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to install dependencies"
                exit 1
            }
            Write-Success "Dependencies installed"
        } else {
            Write-Info "Dependencies already installed"
        }
        
        # Run TypeORM migrations
        Write-Info "Running TypeORM migrations..."
        npm run migration:run
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Database migrations completed successfully"
            
            # Auto-seed based on configuration
            if ($Seeding_Enabled -and $Seeding_AutoSeed) {
                Write-Step "Auto-seeding database for $Environment environment"
                
                foreach ($seeder in $Seeding_Seeders) {
                    Write-Info "Running seeder: $seeder"
                    npm run "seed:$seeder"
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "Seeder '$seeder' completed successfully"
                    } else {
                        Write-Warning "Seeder '$seeder' completed with errors (this may be normal if data already exists)"
                    }
                }
                
                Write-Success "Database seeding completed"
            } else {
                Write-Info "Auto-seeding disabled for $Environment environment"
                Write-Info "To manually seed, run: npm run seed:roles"
            }
        } else {
            Write-Error "Database migrations failed"
        }
        
        Pop-Location
    }
    
    "seed" {
        Write-Step "SEEDING DATABASE FOR $($Environment.ToUpper())"
        
        # Change to repo root directory for npm commands
        $repoRoot = Split-Path -Parent $PSScriptRoot
        Push-Location $repoRoot
        Write-Info "Working directory: $(Get-Location)"
        
        Write-Info "Seeding Configuration (from .deployment/seeding-config.json):"
        if ($EnvSeedingConfig) {
            Write-Info "  Enabled: $($EnvSeedingConfig.enabled)"
            Write-Info "  Auto-Seed: $($EnvSeedingConfig.autoSeed)"
            Write-Info "  Seeders: $($EnvSeedingConfig.seeders -join ', ')"
            Write-Info "  Reason: $($EnvSeedingConfig.reason)"
        } else {
            Write-Warning "Seeding config not found. Using defaults."
            Write-Info "  Seeders: $($Seeding_Seeders -join ', ')"
        }
        
        # Verify PostgreSQL Database exists
        if (-not (Test-AzPostgresDatabaseExists -ServerName $DB_SERVER_NAME -DatabaseName $DB_NAME -ResourceGroupName $RESOURCE_GROUP)) {
            Write-Error "Database '$DB_NAME' does not exist. Run provision and migrate actions first."
            exit 1
        }
        
        Write-Success "Database '$DB_NAME' verified"
        
        # Ensure required Postgres extensions are on the server's allow-list before seeders run.
        Write-Step "Verifying Postgres extension allow-list"
        Set-PostgresExtensionAllowList -ServerName $DB_SERVER_NAME -ResourceGroupName $RESOURCE_GROUP
        
        # Ensure SSL requirement is disabled for dev/qa (already done on creation, but verify for existing servers)
        if ($Environment -ne "prod") {
            Write-Info "Ensuring non-SSL connections are allowed for $Environment environment..."
            try {
                az postgres flexible-server parameter set `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --name "require_secure_transport" `
                    --value "OFF" 2>$null
                Write-Success "SSL requirement configuration verified"
            } catch {
                Write-Warning "Could not verify SSL configuration: $_"
            }
        }
        
        # Ensure PostgreSQL firewall allows current IP
        Write-Step "Verifying PostgreSQL firewall access"
        try {
            $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -ErrorAction Stop | ConvertFrom-Json).ip
            Write-Info "Your public IP: $myIp"
            
            # Check if AllowMyIP rule already exists with correct IP
            $existingRule = az postgres flexible-server firewall-rule show `
                --name "AllowMyIP" `
                --server-name $DB_SERVER_NAME `
                --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            
            if ($existingRule -and $existingRule.startIpAddress -eq $myIp) {
                Write-Success "Firewall rule 'AllowMyIP' already exists for $myIp"
            } else {
                Write-Info "Adding/updating firewall rule for your IP..."
                az postgres flexible-server firewall-rule create `
                    --name "AllowMyIP" `
                    --server-name $DB_SERVER_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --start-ip-address $myIp `
                    --end-ip-address $myIp 2>$null
                Write-Success "Firewall rule created/updated for $myIp"
            }
        } catch {
            Write-Warning "Could not verify/configure firewall: $_"
            Write-Warning "If seeders fail, manually add your IP to PostgreSQL firewall rules"
        }
        
        # Retrieve database password from Key Vault and set environment variables
        Write-Step "Setting up database connection environment"
        try {
            # Always retrieve fresh password from Key Vault for seeders
            Write-Info "Retrieving database password from Key Vault..."
            $kvSecret = az keyvault secret show --vault-name $KEY_VAULT_NAME --name "DB-PASSWORD" 2>$null | ConvertFrom-Json
            if ($kvSecret -and $kvSecret.value) {
                $env:DB_PASSWORD = $kvSecret.value
                Write-Success "Retrieved password from Key Vault (length: $($env:DB_PASSWORD.Length) chars)"
            } else {
                Write-Error "Failed to retrieve password from Key Vault or password is empty"
                Pop-Location
                exit 1
            }
            
            # Get database FQDN
            $pgServer = az postgres flexible-server show --name $DB_SERVER_NAME --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            $env:DB_HOST = $pgServer.fullyQualifiedDomainName
            $env:DB_PORT = "5432"
            $env:DB_USERNAME = $DB_USER
            $env:DB_NAME = $DB_NAME
            
            # Create .env file for seeders
            Write-Info "Creating .env file for TypeORM..."
            $envContent = @"
DB_HOST=$($env:DB_HOST)
DB_PORT=$($env:DB_PORT)
DB_USERNAME=$($env:DB_USERNAME)
DB_PASSWORD=$($env:DB_PASSWORD)
DB_NAME=$($env:DB_NAME)
NODE_ENV=$Environment
"@
            Set-Content -Path ".env" -Value $envContent -Encoding UTF8
            Write-Success ".env file created"
            
            Write-Success "Database connection environment variables set"
        } catch {
            Write-Error "Failed to set up database connection: $_"
            Pop-Location
            exit 1
        }
        
        if ($Seeding_Enabled) {
            Write-Step "Running seeders for $Environment"
            
            foreach ($seeder in $Seeding_Seeders) {
                Write-Info "Running seeder: $seeder"
                npm run "seed:$seeder"
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Seeder '$seeder' completed successfully"
                } else {
                    Write-Warning "Seeder '$seeder' completed with errors (this may be normal if data already exists)"
                }
            }
            
            Write-Success "Database seeding completed"
        } else {
            Write-Warning "Seeding is disabled for the $Environment environment"
            Write-Info "To enable, update .deployment/seeding-config.json and set 'enabled': true"
        }
        
        Pop-Location
    }
    
    "secrets" {
        Write-Step "UPDATING BACKEND SECRETS FOR $($Environment.ToUpper())"
        
        Write-Info "Key Vault: $KEY_VAULT_NAME"
        
        # Verify Key Vault exists
        if (-not (Test-AzKeyVaultExists -KeyVaultName $KEY_VAULT_NAME)) {
            Write-Error "Key Vault '$KEY_VAULT_NAME' does not exist"
            exit 1
        }
        
        Write-Success "Key Vault '$KEY_VAULT_NAME' verified"
        
        # Verify PostgreSQL Database exists
        Write-Step "Retrieving PostgreSQL Server Information"
        if (-not (Test-AzPostgresDatabaseExists -ServerName $DB_SERVER_NAME -DatabaseName $DB_NAME -ResourceGroupName $RESOURCE_GROUP)) {
            Write-Error "Database '$DB_NAME' does not exist. Run provision action first."
            exit 1
        }
        
        Write-Success "Database '$DB_NAME' verified"
        
        # Get PostgreSQL Server FQDN
        try {
            $pgServer = az postgres flexible-server show --name $DB_SERVER_NAME --resource-group $RESOURCE_GROUP 2>$null | ConvertFrom-Json
            $DB_FQDN = $pgServer.fullyQualifiedDomainName
            Write-Info "PostgreSQL Server FQDN: $DB_FQDN"
        } catch {
            Write-Error "Failed to retrieve PostgreSQL Server FQDN: $_"
            exit 1
        }
        
        # Generate or retrieve database password
        if (-not $env:DB_PASSWORD) {
            Write-Warning "DB_PASSWORD environment variable not set. Generate a secure password and set DB_PASSWORD before running this action."
            Write-Info "Example: `$env:DB_PASSWORD = 'YourSecurePassword123!'; .\Deploy-Backend.ps1 -Environment $Environment -Action secrets"
            exit 1
        }

        # Get or prompt for Azure Storage connection string
        $azureStorageConnStr = $env:AZURE_STORAGE_CONNECTION_STRING
        if (-not $azureStorageConnStr) {
            # Auto-fetch from storage-vault if defined in container-spec (e.g. QA uses akvdev1rwai)
            $storageVault = if ($EnvContainerSpec -and $EnvContainerSpec.PSObject.Properties.Name -contains 'storage-vault') {
                $EnvContainerSpec.'storage-vault'
            } else { $null }

            if ($storageVault) {
                Write-Info "Fetching storage connection string from storage-vault '$storageVault'..."
                # Try both naming conventions (hyphens required by KV, but underscore variant may exist)
                $kvStorageSecret = az keyvault secret show `
                    --vault-name $storageVault `
                    --name "AZURE-STORAGE-CONNECTION-STRING" 2>$null | ConvertFrom-Json
                if (-not ($kvStorageSecret -and $kvStorageSecret.value)) {
                    $kvStorageSecret = az keyvault secret show `
                        --vault-name $storageVault `
                        --name "AZURE_STORAGE_CONNECTION_STRING" 2>$null | ConvertFrom-Json
                }
                if ($kvStorageSecret -and $kvStorageSecret.value) {
                    $azureStorageConnStr = $kvStorageSecret.value
                    Write-Success "Storage connection string retrieved from '$storageVault'"
                } else {
                    Write-Warning "Storage connection string not found in storage-vault '$storageVault'"
                }
            }

            if (-not $azureStorageConnStr) {
                Write-Host ""
                Write-Warning "AZURE_STORAGE_CONNECTION_STRING is not set as an environment variable."
                $azureStorageConnStr = Read-Host "Enter the Azure Storage connection string for '$Environment' (leave blank to skip)"
            }
        }
        
        # Construct PostgreSQL connection string
        $DATABASE_URL = "postgresql://${DB_USER}:$($env:DB_PASSWORD)@${DB_FQDN}:5432/${DB_NAME}"
        
        Write-Step "Storing Secrets in Key Vault"
        
        # Array of secrets to store
        $secrets = @{
            "DATABASE-URL" = $DATABASE_URL
            "DB-HOST" = $DB_FQDN
            "DB-PORT" = "5432"
            "DB-USERNAME" = $DB_USER
            "DB-PASSWORD" = $env:DB_PASSWORD
            "DB-NAME" = $DB_NAME
            "JWT-SECRET" = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { -join ((33..126) | Get-Random -Count 32 | ForEach-Object { [char]$_ }) }
            "JWT-EXPIRATION" = "7d"
            "NODE-ENV" = $Environment
        }

        if ($azureStorageConnStr) {
            # Key Vault secret names only support alphanumeric and hyphens — use hyphens
            $secrets["AZURE-STORAGE-CONNECTION-STRING"] = $azureStorageConnStr
        } else {
            Write-Warning "Skipping AZURE-STORAGE-CONNECTION-STRING — not provided."
        }
        
        # Store each secret in Key Vault
        foreach ($secretName in $secrets.Keys) {
            try {
                Write-Info "Setting secret: $secretName"
                az keyvault secret set --vault-name $KEY_VAULT_NAME --name $secretName --value $secrets[$secretName] | Out-Null
                Write-Success "Secret '$secretName' stored successfully"
            } catch {
                Write-Error "Failed to store secret '$secretName': $_"
                exit 1
            }
        }
        
        Write-Success "All backend secrets updated successfully in Key Vault!"
        Write-Info "Secrets are available for Container App via Key Vault references"
    }
    
    "dns" {
        Write-Step "CONFIGURING CUSTOM DOMAIN AND DNS"
        
        # Ensure we're logged into Azure
        Test-AzureLogin
        
        # Verify Container App exists
        if (-not (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME)) {
            Write-Error "Container App '$BACKEND_CONTAINER_APP_NAME' does not exist"
            Write-Info "Please provision the backend first using: .\Deploy-Backend.ps1 -Environment $Environment -Action provision"
            exit 1
        }
        
        Write-Success "Container App verified"
        
        # Get custom domain
        $customDomain = $CUSTOM_DOMAIN_BACKEND[$Environment]
        if (-not $customDomain) {
            Write-Error "No custom domain configured for environment: $Environment"
            exit 1
        }
        
        Write-Info "Environment: $Environment"
        Write-Info "Custom Domain: $customDomain"
        
        # Configure custom domain and DNS
        Set-CustomDomain -CustomDomain $customDomain
        
        Write-Success "DNS configuration complete!"
    }
    
    "sp" {
        Write-Step "CONFIGURING GITHUB ACTIONS OIDC AUTHENTICATION"
        
        Write-Info "GitHub Organization: $GitHubOrg"
        Write-Info "GitHub Repository: $GitHubRepo"
        
        # Ensure we're logged into Azure
        Test-AzureLogin
        
        # Call the OIDC configuration function
        New-GitHubActionsOIDC -GitHubOrg $GitHubOrg -GitHubRepo $GitHubRepo
    }
    
    "health" {
        Write-Step "CHECKING BACKEND HEALTH"
        
        Write-Info "Container App: $BACKEND_CONTAINER_APP_NAME"
        Write-Info "Health Endpoint: $BACKEND_HEALTH_ENDPOINT"
        
        # Verify Container App exists
        if (-not (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME)) {
            Write-Error "Container App '$BACKEND_CONTAINER_APP_NAME' does not exist"
            exit 1
        }
        
        Write-Success "Container App verified"
        
        # TODO: Implement health check
        # Example:
        # $appUrl = az containerapp show --name $BACKEND_CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv
        # $healthUrl = "https://$appUrl$BACKEND_HEALTH_ENDPOINT"
        # $response = Invoke-WebRequest -Uri $healthUrl -ErrorAction SilentlyContinue
        # if ($response.StatusCode -eq 200) { Write-Success "Backend is healthy" }
        
        Write-Warning "Health check implementation required. Add endpoint health verification here."
    }
    
    "logs" {
        Write-Step "FETCHING BACKEND LOGS"
        
        Write-Info "Container App: $BACKEND_CONTAINER_APP_NAME"
        
        # Verify Container App exists
        if (-not (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME)) {
            Write-Error "Container App '$BACKEND_CONTAINER_APP_NAME' does not exist"
            exit 1
        }
        
        Write-Success "Container App verified"
        
        # TODO: Implement log retrieval
        # Example:
        # az containerapp logs show --name $BACKEND_CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --follow
        
        Write-Warning "Log retrieval implementation required. Add log streaming here."
    }
}

Write-Host "`n✓ Backend script execution completed!`n" -ForegroundColor Green
#endregion
