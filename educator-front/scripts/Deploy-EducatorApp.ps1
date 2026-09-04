<#
.SYNOPSIS
    Provisions Azure infrastructure for Educator App (frontend + backend). Deployments are handled via GitHub Actions.

.DESCRIPTION
    This script provisions:
    - Azure Static Web App for Next.js/Vite frontend
    - Azure Container App for NestJS backend
    - Azure Key Vault for secure secrets management
    - Custom DNS and SSL certificates
    - Application Insights for monitoring

    NOTE: All builds and deployments are handled via GitHub Actions.
    Push to the appropriate branch to trigger deployment:
    - dev branch  -> dev environment
    - qa branch   -> qa environment  
    - main branch -> prod environment

.PARAMETER Environment
    The deployment environment: dev, qa, or prod

.PARAMETER Action
    The action to perform:
    - provision: Create Azure infrastructure
    - secrets: Update Key Vault secrets
    - dns: Configure custom domains
    - status: Check deployment status
    - sp: Create/reset GitHub Actions service principal
    - monitoring: Setup Application Insights and availability tests

.PARAMETER GitHubOrg
    GitHub organization or username (for forks). Default: Realityworks-AI

.PARAMETER GitHubRepo
    GitHub repository names. Default: Educator-App-Frontend, Educator-App-Backend

.PARAMETER PorkbunApiKey
    Porkbun API key for DNS automation. Can also be set via PORKBUN_API_KEY environment variable.

.PARAMETER PorkbunSecretKey
    Porkbun secret API key for DNS automation. Can also be set via PORKBUN_SECRET_KEY environment variable.

.PARAMETER UsePorkbunDNS
    Switch to automatically configure DNS records via Porkbun API.

.EXAMPLE
    .\Deploy-EducatorApp.ps1 -Environment qa -Action provision

.EXAMPLE
    .\Deploy-EducatorApp.ps1 -Environment prod -Action dns -UsePorkbunDNS

.EXAMPLE
    .\Deploy-EducatorApp.ps1 -Environment qa -Action monitoring

#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "qa", "prod")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("provision", "secrets", "dns", "status", "sp", "monitoring")]
    [string]$Action = "provision",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubOrg = "Realityworks-AI",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubFrontendRepo = "Educator-App-Realityworks",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubBackendRepo = "Educator-App-Backend",
    
    # Porkbun DNS API Configuration
    [Parameter(Mandatory=$false)]
    [string]$PorkbunApiKey = $env:PORKBUN_API_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$PorkbunSecretKey = $env:PORKBUN_SECRET_KEY,
    
    [Parameter(Mandatory=$false)]
    [switch]$UsePorkbunDNS
)

#region ==================== NAMING CONVENTIONS ====================
# Follows consistent naming standards
# ARG = Azure Resource Group
# ACR = Azure Container Registry
# ACA = Azure Container App
# ASW = Azure Static Web App
# AKV = Azure Key Vault
# AAI = Azure Application Insights

$LOCATION = "East US 2"  # East US doesn't support SWA; East US 2 supports both SWA and PostgreSQL
$AZUREVERSION = "1"
$CONTAINERVERSION = "1"
$AZPREFIX = "rwai"  # Organization prefix (shared with other platform apps)
$APP = "edu"        # Application identifier

# Resource naming (environment-specific) - uses existing platform resource groups
$RESOURCE_GROUP = "ARG-" + $Environment + $AZUREVERSION + "-" + $AZPREFIX
$ENVIRONMENT_NAME = "AEN-" + $Environment + $AZUREVERSION + "-" + $AZPREFIX  # Per-env AEN
$ENVIRONMENT_RESOURCE_GROUP = $RESOURCE_GROUP  # AEN lives in per-env RG
$KEY_VAULT_NAME = "akv" + $Environment + $AZUREVERSION + $AZPREFIX  # Existing shared KV (no edu suffix)
$BACKEND_CONTAINER_APP_NAME = "aca-" + $Environment + $CONTAINERVERSION + "-" + $AZPREFIX + "-" + $APP + "back"
$FRONTEND_STATIC_WEB_APP_NAME = "swa-" + $Environment + $CONTAINERVERSION + "-" + $AZPREFIX + "-" + $APP + "front"

# Shared resources (platform-wide, in ARG-all1-rwai)
$ALL_RESOURCE_GROUP = "ARG-all" + $AZUREVERSION + "-" + $AZPREFIX
$CONTAINERREGISTRY_NAME = "acrall" + $AZUREVERSION + $AZPREFIX

# Monitoring resources (shared in ARG-all1-rwai)
$APP_INSIGHTS_NAME = "appi-all" + $AZUREVERSION + "-" + $AZPREFIX  # Shared App Insights
$ACTION_GROUP_NAME = "ag-all-" + $AZPREFIX + "-alerts"
$LOG_ANALYTICS_NAME = "ALA-all" + $AZUREVERSION + "-" + $AZPREFIX

# Alert recipient
$ALERT_EMAIL = "james.clapper@rwthrive.com"

# Image names (backend only - frontend uses SWA with build-time env vars)
$BACKEND_IMAGE_NAME = "educator-backend"
$BACKEND_IMAGE_VERSION = "1"

# DNS Configuration - customize these for your domain
$CUSTOM_DOMAIN_FRONTEND = @{
    "dev"   = "dev.educator.realityworksai.com"
    "qa"    = "qa.educator.realityworksai.com"
    "prod"  = "educator.realityworksai.com"
}

$CUSTOM_DOMAIN_BACKEND = @{
    "dev"   = "dev.educatorbe.realityworksai.com"
    "qa"    = "qa.educatorbe.realityworksai.com"
    "prod"  = "educatorbe.realityworksai.com"
}

# VNET Config
$OCTET_MAP = @{
    "dev"   = "30"
    "qa"    = "31"
    "prod"  = "32"
    "all"   = "36"
}
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

function Test-AzStaticWebAppExists {
    param([string]$WebAppName)
    $result = az staticwebapp show --name $WebAppName 2>$null
    return $null -ne $result
}

function Test-AzLogAnalyticsWorkspaceExists {
    param(
        [string]$ResourceGroupName,
        [string]$WorkspaceName
    )
    $result = az monitor log-analytics workspace show --name $WorkspaceName --resource-group $ResourceGroupName 2>$null
    return $null -ne $result
}

function Invoke-AzCommand {
    param(
        [string]$Command,
        [string]$Description
    )
    
    Write-Info "Executing: $Description"
    $output = Invoke-Expression $Command 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Command failed: $Description`n$output"
        return $false
    }
    
    return $output
}
#endregion

#region ==================== PORKBUN DNS MANAGEMENT ====================
function Test-PorkbunCredentials {
    <#
    .SYNOPSIS
        Validates Porkbun API credentials are available, prompting if not set.
    #>
    param([switch]$Silent)

    if (-not $script:PorkbunApiKey)    { $script:PorkbunApiKey    = $PorkbunApiKey }
    if (-not $script:PorkbunSecretKey) { $script:PorkbunSecretKey = $PorkbunSecretKey }

    if ($Silent) {
        return ($script:PorkbunApiKey -and $script:PorkbunSecretKey)
    }

    if (-not $script:PorkbunApiKey) {
        Write-Host "`nPorkbun API credentials not configured." -ForegroundColor Yellow
        Write-Host "Get your API keys from: https://porkbun.com/account/api" -ForegroundColor Gray
        $script:PorkbunApiKey = Read-Host -Prompt "Enter Porkbun API Key (pk1_...)"
        if (-not $script:PorkbunApiKey) {
            Write-Error "Porkbun API Key is required for -UsePorkbunDNS"
            return $false
        }
    }
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
        Creates or updates a DNS record via Porkbun API (deletes existing
        records of same name+type first to ensure idempotency).
    #>
    param(
        [Parameter(Mandatory=$true)][string]$Domain,
        [Parameter(Mandatory=$true)][string]$Subdomain,
        [Parameter(Mandatory=$true)][ValidateSet("A","AAAA","CNAME","TXT","MX","NS","SRV","CAA")][string]$RecordType,
        [Parameter(Mandatory=$true)][string]$Content,
        [Parameter(Mandatory=$false)][int]$TTL = 600
    )

    if (-not (Test-PorkbunCredentials)) { return $false }

    $baseUrl = "https://api.porkbun.com/api/json/v3"
    $authBody = @{
        secretapikey = $script:PorkbunSecretKey
        apikey       = $script:PorkbunApiKey
    } | ConvertTo-Json

    Write-Info "Checking for existing $RecordType record: $Subdomain.$Domain"
    try {
        $retrieveUrl = "$baseUrl/dns/retrieveByNameType/$Domain/$RecordType/$Subdomain"
        $existing = Invoke-RestMethod -Uri $retrieveUrl -Method Post -Body $authBody -ContentType "application/json" -ErrorAction SilentlyContinue
        if ($existing.status -eq "SUCCESS" -and $existing.records) {
            foreach ($r in $existing.records) {
                Write-Info "Deleting existing record ID: $($r.id)"
                $delUrl = "$baseUrl/dns/delete/$Domain/$($r.id)"
                Invoke-RestMethod -Uri $delUrl -Method Post -Body $authBody -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
            }
        }
    } catch { }

    $createBody = @{
        secretapikey = $script:PorkbunSecretKey
        apikey       = $script:PorkbunApiKey
        name         = $Subdomain
        type         = $RecordType
        content      = $Content
        ttl          = $TTL.ToString()
    } | ConvertTo-Json

    Write-Host "  Creating $RecordType record: $Subdomain.$Domain -> $Content" -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$baseUrl/dns/create/$Domain" -Method Post -Body $createBody -ContentType "application/json"
        if ($resp.status -eq "SUCCESS") {
            Write-Success "$RecordType record created: $Subdomain.$Domain"
            return $true
        }
        Write-Error "Porkbun API error: $($resp.message)"
        return $false
    } catch {
        Write-Error "Failed to create DNS record: $($_.Exception.Message)"
        return $false
    }
}

function Split-CustomDomain {
    <#
    .SYNOPSIS
        Splits "dev.educator.realityworksai.com" into
        @{ Root = 'realityworksai.com'; Subdomain = 'dev.educator' }.
    #>
    param([string]$Fqdn)
    $parts = $Fqdn -split '\.'
    if ($parts.Count -lt 3) {
        throw "Custom domain must be a subdomain (e.g. dev.educator.realityworksai.com): $Fqdn"
    }
    return @{
        Root      = ($parts[-2..-1] -join '.')
        Subdomain = ($parts[0..($parts.Count - 3)] -join '.')
    }
}

function Set-FrontendCustomDomain {
    <#
    .SYNOPSIS
        Bind a custom domain to the Static Web App and provision a managed
        SSL certificate. Optionally creates the CNAME via Porkbun first.
    #>
    param(
        [Parameter(Mandatory=$true)][string]$CustomDomain,
        [Parameter(Mandatory=$false)][switch]$UsePorkbun
    )

    Write-Step "Configuring Custom Domain for Frontend SWA: $CustomDomain"

    # Get SWA default hostname (CNAME target)
    $defaultHostname = az staticwebapp show `
        --name $FRONTEND_STATIC_WEB_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --query "defaultHostname" -o tsv 2>$null

    if (-not $defaultHostname) {
        Write-Error "Failed to get SWA default hostname"
        return
    }
    Write-Info "SWA default hostname: $defaultHostname"

    # 1. CNAME record
    if ($UsePorkbun) {
        $split = Split-CustomDomain -Fqdn $CustomDomain
        Write-Info "Root domain: $($split.Root)"
        Write-Info "Subdomain:   $($split.Subdomain)"

        $ok = Set-PorkbunDNSRecord `
            -Domain $split.Root `
            -Subdomain $split.Subdomain `
            -RecordType "CNAME" `
            -Content $defaultHostname
        if (-not $ok) { Write-Error "Failed to create CNAME record"; return }

        Write-Info "Waiting 30 seconds for DNS propagation..."
        Start-Sleep -Seconds 30
    } else {
        Write-Host "`nAdd this DNS record:" -ForegroundColor Yellow
        Write-Host "  CNAME: $CustomDomain -> $defaultHostname" -ForegroundColor Cyan
        Write-Host "Tip: Use -UsePorkbunDNS to configure automatically" -ForegroundColor Gray
        Read-Host "`nPress Enter after the CNAME has been configured..."
    }

    # 2. Bind hostname to SWA (provisions managed cert via cname-delegation validation)
    Write-Info "Binding hostname to SWA (provisions managed certificate)..."
    $existingHost = az staticwebapp hostname list `
        --name $FRONTEND_STATIC_WEB_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --query "[?name=='$CustomDomain'].name" -o tsv 2>$null

    if ($existingHost) {
        Write-Info "Hostname '$CustomDomain' already bound to SWA"
    } else {
        $bindOutput = az staticwebapp hostname set `
            --name $FRONTEND_STATIC_WEB_APP_NAME `
            --resource-group $RESOURCE_GROUP `
            --hostname $CustomDomain `
            --validation-method "cname-delegation" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Hostname bound: $CustomDomain"
        } else {
            Write-Error "Failed to bind hostname: $bindOutput"
            return
        }
    }

    # 3. Report cert status (managed cert provisions asynchronously)
    Write-Info "Checking managed certificate status..."
    $hostInfo = az staticwebapp hostname show `
        --name $FRONTEND_STATIC_WEB_APP_NAME `
        --resource-group $RESOURCE_GROUP `
        --hostname $CustomDomain `
        -o json 2>$null | ConvertFrom-Json

    if ($hostInfo) {
        Write-Info "  Status:           $($hostInfo.status)"
        Write-Info "  Validation token: $($hostInfo.validationToken)"
        if ($hostInfo.status -eq "Ready") {
            Write-Success "Managed certificate is provisioned and active"
        } else {
            Write-Info "Managed certificate provisioning is in progress (typically 5-30 min)."
            Write-Info "Re-run 'az staticwebapp hostname show ...' to monitor."
        }
    }

    Write-Success "Custom domain configuration complete for $CustomDomain"
}
#endregion

#region ==================== MAIN DEPLOYMENT LOGIC ====================

Write-Host "
╔══════════════════════════════════════════════════════════════╗
║       Educator App - Azure Deployment Script                ║
║       Environment: $Environment | Action: $Action                     ║
╚══════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

# Validate Azure CLI
Test-AzureLogin

# Get subscription ID for RBAC operations
$SUBSCRIPTION_ID = (az account show --query id -o tsv)
$CURRENT_USER = (az account show --query user.name -o tsv)
Write-Info "Current user: $CURRENT_USER (subscription: $SUBSCRIPTION_ID)"

# Route to appropriate action
switch ($Action) {
    "provision" {
        Write-Step "PROVISIONING INFRASTRUCTURE FOR $($Environment.ToUpper())"
        
        Write-Info "Resource Group: $RESOURCE_GROUP"
        Write-Info "Location: $LOCATION"
        Write-Info "Backend Container App: $BACKEND_CONTAINER_APP_NAME"
        Write-Info "Frontend Static Web App: $FRONTEND_STATIC_WEB_APP_NAME"
        Write-Info "Key Vault: $KEY_VAULT_NAME"
        
        # 0. Create / Verify shared resource group (if different from environment RG)
        if ($ENVIRONMENT_RESOURCE_GROUP -ne $RESOURCE_GROUP) {
            Write-Step "Creating/Verifying Shared Resource Group"
            if (Test-AzResourceGroupExists -ResourceGroupName $ENVIRONMENT_RESOURCE_GROUP) {
                Write-Success "Shared Resource Group '$ENVIRONMENT_RESOURCE_GROUP' already exists"
            } else {
                Write-Info "Creating shared resource group: $ENVIRONMENT_RESOURCE_GROUP in $LOCATION"
                az group create --name $ENVIRONMENT_RESOURCE_GROUP --location $LOCATION
                Write-Success "Shared Resource Group created: $ENVIRONMENT_RESOURCE_GROUP"
            }
        }
        
        # 1. Create / Verify resource group
        Write-Step "Creating/Verifying Resource Group"
        if (Test-AzResourceGroupExists -ResourceGroupName $RESOURCE_GROUP) {
            Write-Success "Resource Group '$RESOURCE_GROUP' already exists"
        } else {
            Write-Info "Creating resource group: $RESOURCE_GROUP in $LOCATION"
            az group create --name $RESOURCE_GROUP --location $LOCATION
            Write-Success "Resource Group created: $RESOURCE_GROUP"
        }
        
        # 2. Create / Verify Key Vault
        Write-Step "Creating/Verifying Key Vault"
        if (Test-AzKeyVaultExists -KeyVaultName $KEY_VAULT_NAME) {
            Write-Success "Key Vault '$KEY_VAULT_NAME' already exists"
        } else {
            Write-Info "Creating Key Vault: $KEY_VAULT_NAME"
            az keyvault create --name $KEY_VAULT_NAME `
                --resource-group $RESOURCE_GROUP `
                --location $LOCATION
            Write-Success "Key Vault created: $KEY_VAULT_NAME"
        }
        
        # 2.1 Set RBAC Permissions for Key Vault
        Write-Step "Setting Key Vault RBAC Permissions"
        try {
            $kvResourceId = "/subscriptions/$SUBSCRIPTION_ID/resourcegroups/$RESOURCE_GROUP/providers/microsoft.keyvault/vaults/$KEY_VAULT_NAME"
            
            # Grant current user Key Vault Secrets Officer role
            Write-Info "Granting Key Vault Secrets Officer role to $CURRENT_USER..."
            az role assignment create `
                --role "Key Vault Secrets Officer" `
                --assignee "$CURRENT_USER" `
                --scope $kvResourceId 2>$null
            
            Write-Success "RBAC permissions configured for Key Vault"
        } catch {
            Write-Warning "Could not configure RBAC permissions: $_"
        }
        
        # 3. Verify Container Registry exists (shared - managed by backend/platform infra)
        Write-Step "Verifying Container Registry (shared)"
        if (Test-AzResourceExists -ResourceGroupName $ALL_RESOURCE_GROUP -ResourceName $CONTAINERREGISTRY_NAME -ResourceType "Microsoft.ContainerRegistry/registries") {
            Write-Success "Container Registry '$CONTAINERREGISTRY_NAME' exists in $ALL_RESOURCE_GROUP"
        } else {
            Write-Warning "Container Registry '$CONTAINERREGISTRY_NAME' not found in $ALL_RESOURCE_GROUP"
            Write-Warning "ACR is shared infrastructure - run Deploy-Backend.ps1 -Action provision first"
        }
        
        # 4. Verify Log Analytics Workspace exists (shared - managed by backend/platform infra)
        Write-Step "Verifying Log Analytics Workspace (shared)"
        if (Test-AzLogAnalyticsWorkspaceExists -ResourceGroupName $ALL_RESOURCE_GROUP -WorkspaceName $LOG_ANALYTICS_NAME) {
            Write-Success "Log Analytics workspace '$LOG_ANALYTICS_NAME' exists in $ALL_RESOURCE_GROUP"
            $workspaceId = az monitor log-analytics workspace show `
                --resource-group $ALL_RESOURCE_GROUP `
                --workspace-name $LOG_ANALYTICS_NAME `
                --query customerId -o tsv 2>&1
            
            $workspaceKey = az monitor log-analytics workspace get-shared-keys `
                --resource-group $ALL_RESOURCE_GROUP `
                --workspace-name $LOG_ANALYTICS_NAME `
                --query primarySharedKey -o tsv 2>&1
        } else {
            Write-Warning "Log Analytics workspace '$LOG_ANALYTICS_NAME' not found in $ALL_RESOURCE_GROUP"
            Write-Warning "LAW is shared infrastructure - run Deploy-Backend.ps1 -Action provision first"
        }
        
        # 5. Verify Container Apps Environment exists (create if missing)
        Write-Step "Verifying Container Apps Environment"
        if (Test-AzResourceExists -ResourceGroupName $RESOURCE_GROUP -ResourceName $ENVIRONMENT_NAME -ResourceType "Microsoft.App/managedEnvironments") {
            Write-Success "Container Apps Environment '$ENVIRONMENT_NAME' exists"
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
                    --resource-group $RESOURCE_GROUP `
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
        
        # 6. Create / Verify Frontend Static Web App
        Write-Step "Creating/Verifying Frontend Static Web App"
        if (Test-AzStaticWebAppExists -WebAppName $FRONTEND_STATIC_WEB_APP_NAME) {
            Write-Success "Frontend Static Web App '$FRONTEND_STATIC_WEB_APP_NAME' already exists"
            
            # Try to update GitHub Secrets with deployment token
            try {
                $ghCliCheck = gh --version 2>$null
                if ($ghCliCheck) {
                    Write-Info "Updating GitHub Secrets with SWA deployment token..."
                    $deploymentToken = az staticwebapp secrets list `
                        --name $FRONTEND_STATIC_WEB_APP_NAME `
                        --resource-group $RESOURCE_GROUP `
                        --query "properties.apiKey" -o tsv
                    
                    if ($deploymentToken) {
                        $secretName = "AZURE_STATIC_WEB_APPS_API_TOKEN_" + $Environment.ToUpper()
                        gh secret set $secretName --body $deploymentToken
                        Write-Success "GitHub Secret '$secretName' updated with deployment token"
                    }
                }
            }
            catch {
                Write-Warning "Could not update GitHub Secrets: $_"
            }
        } else {
            Write-Info "Creating Frontend Static Web App: $FRONTEND_STATIC_WEB_APP_NAME"
            try {
                # Create the SWA resource in environment-specific resource group
                # Note: No GitHub integration here - deployment is handled by GitHub Actions workflow
                $swaOutput = az staticwebapp create `
                    --name $FRONTEND_STATIC_WEB_APP_NAME `
                    --resource-group $RESOURCE_GROUP `
                    --location $LOCATION `
                    --sku Standard 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Frontend Static Web App created: $FRONTEND_STATIC_WEB_APP_NAME"
                    
                    # Retrieve and store deployment token in GitHub Secrets using gh CLI
                    $ghCliCheck = gh --version 2>$null
                    if ($ghCliCheck) {
                        Write-Info "Retrieving deployment token and storing in GitHub Secrets..."
                        Start-Sleep -Seconds 5  # Wait for SWA to be ready
                        
                        $deploymentToken = az staticwebapp secrets list `
                            --name $FRONTEND_STATIC_WEB_APP_NAME `
                            --resource-group $RESOURCE_GROUP `
                            --query "properties.apiKey" -o tsv 2>&1
                        
                        if ($deploymentToken -and $LASTEXITCODE -eq 0) {
                            $secretName = "AZURE_STATIC_WEB_APPS_API_TOKEN_" + $Environment.ToUpper()
                            gh secret set $secretName --body $deploymentToken
                            Write-Success "GitHub Secret '$secretName' created with deployment token"
                        } else {
                            Write-Warning "Could not retrieve SWA deployment token: $deploymentToken"
                        }
                    } else {
                        Write-Warning "GitHub CLI (gh) not found. Deployment token must be manually added to GitHub Secrets."
                        Write-Info "To manually update GitHub Secrets, run:"
                        Write-Info "  `$token = az staticwebapp secrets list --name $FRONTEND_STATIC_WEB_APP_NAME --resource-group $RESOURCE_GROUP --query 'properties.apiKey' -o tsv"
                        Write-Info "  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_$($Environment.ToUpper()) --body `$token"
                    }
                } else {
                    Write-Error "Failed to create Frontend Static Web App: $swaOutput"
                }
            }
            catch {
                Write-Error "Error creating Frontend Static Web App: $_"
            }
        }
        
        Write-Success "Infrastructure provisioning check complete!"
    }
    
    "secrets" {
        Write-Step "UPDATING KEY VAULT SECRETS FOR $($Environment.ToUpper())"
        
        Write-Info "Key Vault: $KEY_VAULT_NAME"
        
        # Verify Key Vault exists
        if (-not (Test-AzKeyVaultExists -KeyVaultName $KEY_VAULT_NAME)) {
            Write-Error "Key Vault '$KEY_VAULT_NAME' does not exist"
            exit 1
        }
        
        Write-Success "Key Vault verified"
        Write-Info "You can now set secrets using:"
        Write-Info "  az keyvault secret set --vault-name $KEY_VAULT_NAME --name 'MySecret' --value 'MyValue'"
        
        # TODO: Implement secrets update logic for frontend and backend
    }
    
    "dns" {
        Write-Step "CONFIGURING DNS FOR $($Environment.ToUpper())"

        $frontendDomain = $CUSTOM_DOMAIN_FRONTEND[$Environment]
        $backendDomain  = $CUSTOM_DOMAIN_BACKEND[$Environment]

        Write-Info "Frontend Domain: $frontendDomain"
        Write-Info "Backend Domain:  $backendDomain (handled by Deploy-Backend.ps1 -Action dns)"

        if (-not (Test-AzStaticWebAppExists -WebAppName $FRONTEND_STATIC_WEB_APP_NAME)) {
            Write-Error "Frontend Static Web App '$FRONTEND_STATIC_WEB_APP_NAME' does not exist"
            exit 1
        }

        Write-Success "Frontend SWA verified for DNS configuration"

        # Configure frontend SWA custom domain + managed cert
        Set-FrontendCustomDomain -CustomDomain $frontendDomain -UsePorkbun:$UsePorkbunDNS

        Write-Info ""
        Write-Info "For backend Container App custom domain, run from the backend repo:"
        Write-Info "  ./scripts/Deploy-Backend.ps1 -Environment $Environment -Action dns -UsePorkbunDNS"
    }
    
    "status" {
        Write-Step "CHECKING DEPLOYMENT STATUS FOR $($Environment.ToUpper())"
        
        Write-Info "Resource Group: $RESOURCE_GROUP"
        
        # Check Resource Group
        if (-not (Test-AzResourceGroupExists -ResourceGroupName $RESOURCE_GROUP)) {
            Write-Warning "Resource Group '$RESOURCE_GROUP' does not exist"
            return
        }
        
        # Check Key Vault
        if (Test-AzKeyVaultExists -KeyVaultName $KEY_VAULT_NAME) {
            Write-Success "✓ Key Vault: $KEY_VAULT_NAME"
        } else {
            Write-Warning "✗ Key Vault: $KEY_VAULT_NAME (not found)"
        }
        
        # Check Log Analytics (if not prod, it's in shared environment RG)
        if (Test-AzLogAnalyticsWorkspaceExists -ResourceGroupName $ENVIRONMENT_RESOURCE_GROUP -WorkspaceName $LOG_ANALYTICS_NAME) {
            Write-Success "✓ Log Analytics: $LOG_ANALYTICS_NAME"
        } else {
            Write-Warning "✗ Log Analytics: $LOG_ANALYTICS_NAME (not found)"
        }
        
        # Check Backend Container App
        if (Test-AzContainerAppExists -ResourceGroupName $RESOURCE_GROUP -ContainerAppName $BACKEND_CONTAINER_APP_NAME) {
            Write-Success "✓ Backend: $BACKEND_CONTAINER_APP_NAME"
        } else {
            Write-Warning "✗ Backend: $BACKEND_CONTAINER_APP_NAME (not found)"
        }
        
        # Check Frontend Static Web App
        if (Test-AzStaticWebAppExists -WebAppName $FRONTEND_STATIC_WEB_APP_NAME) {
            Write-Success "✓ Frontend: $FRONTEND_STATIC_WEB_APP_NAME"
        } else {
            Write-Warning "✗ Frontend: $FRONTEND_STATIC_WEB_APP_NAME (not found)"
        }
    }
    
    "sp" {
        Write-Step "MANAGING GITHUB ACTIONS SERVICE PRINCIPAL FOR $($Environment.ToUpper())"
        
        $spName = "github-actions-educator-$Environment"
        Write-Info "Service Principal Name: $spName"
        
        # Check if SP already exists
        $existingSp = az ad sp list --display-name $spName --query "[0].appId" -o tsv 2>$null
        
        if ($existingSp) {
            Write-Success "Service Principal '$spName' already exists (AppId: $existingSp)"
            Write-Info "Store the following in GitHub secrets:"
            Write-Info "  AZURE_CLIENT_ID: $existingSp"
            Write-Info "  AZURE_TENANT_ID: (from 'az account show')"
            Write-Info "  AZURE_SUBSCRIPTION_ID: (from 'az account show')"
        } else {
            Write-Info "Creating Service Principal: $spName"
            # TODO: Implement service principal creation
            Write-Warning "Service Principal creation not yet implemented. Add SP management logic here."
        }
    }
    
    "monitoring" {
        Write-Step "SETTING UP MONITORING FOR $($Environment.ToUpper())"
        
        Write-Info "Application Insights: $APP_INSIGHTS_NAME"
        Write-Info "Alert Group: $ACTION_GROUP_NAME"
        Write-Info "Alert Email: $ALERT_EMAIL"
        
        # Verify Resource Group exists
        if (-not (Test-AzResourceGroupExists -ResourceGroupName $RESOURCE_GROUP)) {
            Write-Error "Resource Group '$RESOURCE_GROUP' does not exist"
            exit 1
        }
        
        # Check if Application Insights already exists
        $appInsightsExists = az resource show --name $APP_INSIGHTS_NAME --resource-group $RESOURCE_GROUP --resource-type "Microsoft.Insights/components" 2>$null
        
        if ($appInsightsExists) {
            Write-Success "Application Insights '$APP_INSIGHTS_NAME' already exists"
        } else {
            Write-Info "Creating Application Insights: $APP_INSIGHTS_NAME"
            # TODO: Implement Application Insights setup
            # az monitor app-insights component create --app $APP_INSIGHTS_NAME --resource-group $RESOURCE_GROUP
            Write-Warning "Application Insights creation not yet implemented. Add monitoring setup here."
        }
        
        Write-Info "Setup includes:"
        Write-Info "  - Application Insights for metric collection"
        Write-Info "  - Availability tests for endpoints"
        Write-Info "  - Alert group for $ALERT_EMAIL"
    }
}

Write-Host "`n✓ Script execution completed!`n" -ForegroundColor Green
#endregion
