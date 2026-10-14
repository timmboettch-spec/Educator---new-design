# Weekly snapshot-to-git job image. Runs as a scheduled Container Apps Job
# (see infra/modules/containerAppJob-snapshot.bicep) — pulls the backend's
# JSON blob data and pushes a dated commit to the private snapshot repo.
#
# No `az`/`Az` PowerShell module: blob + Key Vault reads go over their REST
# APIs using a token from the Managed Identity endpoint (see entrypoint.ps1),
# which keeps this image small and avoids the module-import cold start the
# `Az.*` modules add on every run.
FROM mcr.microsoft.com/powershell:7.4-alpine-3.20

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY entrypoint.ps1 /app/entrypoint.ps1

USER 1000:1000
ENTRYPOINT ["pwsh", "-NoLogo", "-NoProfile", "-File", "/app/entrypoint.ps1"]
