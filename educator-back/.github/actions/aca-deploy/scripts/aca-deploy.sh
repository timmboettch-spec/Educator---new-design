#!/usr/bin/env bash
# Aggregated ACA Bicep deploy: deploy → resolve → wait-health → smoke → summary.
# Build & push already happened in the action's own steps (ACR login +
# docker-build-push-acr), before this script runs.
set -euo pipefail

# ── deploy (Bicep) ───────────────────────────────────────────────────────
echo "::group::Bicep deploy ($BICEP_TEMPLATE)"
# shellcheck disable=SC2086
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "aca-deploy-${RUN_ID}" \
  --template-file "$BICEP_TEMPLATE" \
  --parameters $BICEP_PARAMS \
  --only-show-errors
echo "::endgroup::"

# ── resolve fqdn + revision ──────────────────────────────────────────────
APP_FQDN=$(az containerapp show -n "$CONTAINER_APP" -g "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
NEW_REVISION=$(az containerapp show -n "$CONTAINER_APP" -g "$RESOURCE_GROUP" \
  --query "properties.latestRevisionName" -o tsv)
ENV_DOMAIN="${APP_FQDN#${CONTAINER_APP}.}"
STAGING_FQDN="https://${NEW_REVISION}.${ENV_DOMAIN}"
{
  echo "app-fqdn=$APP_FQDN"
  echo "new-revision=$NEW_REVISION"
  echo "staging-fqdn=$STAGING_FQDN"
} >> "$GITHUB_OUTPUT"

# ── wait for revision health ─────────────────────────────────────────────
if [ "${WAIT_HEALTH}" = "true" ]; then
  echo "::group::Wait for revision health"
  STATE="Unknown"
  for i in $(seq 1 30); do
    STATE=$(az containerapp revision list --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" \
      --query "sort_by([], &properties.createdTime)[-1].properties.healthState" -o tsv 2>/dev/null || echo "Unknown")
    echo "  attempt $i: healthState=$STATE"
    [ "$STATE" = "Healthy" ] && break
    [ "$STATE" = "Unhealthy" ] && { echo "::error::Revision Unhealthy"; exit 1; }
    sleep 10
  done
  # The loop above only fails fast on an explicit Unhealthy — a revision
  # stuck in Activating/None or an `az` call that kept erroring to "Unknown"
  # would otherwise exhaust all 30 tries and fall through here silently,
  # letting the deploy report success on a revision that never became Healthy.
  if [ "$STATE" != "Healthy" ]; then
    echo "::error::Revision did not become healthy within timeout (last state: $STATE)"
    exit 1
  fi
  echo "::endgroup::"
fi

# ── smoke ────────────────────────────────────────────────────────────────
SMOKE_PASSED="skipped"
if [ "${RUN_SMOKE}" = "true" ]; then
  if [ "$SMOKE_TARGET" = "latest-revision" ]; then
    SMOKE_URL="${STAGING_FQDN}${SMOKE_PATH}"
  else
    SMOKE_URL="https://${APP_FQDN}${SMOKE_PATH}"
  fi
  echo "Smoke test: $SMOKE_URL"
  if curl --fail --retry 12 --retry-delay 6 --retry-connrefused "$SMOKE_URL"; then
    SMOKE_PASSED="true"
    echo "Smoke: passed"
  else
    SMOKE_PASSED="false"
    if [ "${SMOKE_BLOCKING}" = "true" ]; then
      echo "smoke-passed=false" >> "$GITHUB_OUTPUT"
      echo "::error::Smoke test failed (blocking): $SMOKE_URL"
      exit 1
    fi
    echo "::warning::Smoke test failed (non-blocking): $SMOKE_URL"
  fi
fi
echo "smoke-passed=$SMOKE_PASSED" >> "$GITHUB_OUTPUT"

# ── summary ──────────────────────────────────────────────────────────────
{
  echo "## Deploy summary"
  echo ""
  echo "| | |"
  echo "|---|---|"
  echo "| App | \`$CONTAINER_APP\` |"
  echo "| Revision | \`$NEW_REVISION\` |"
  echo "| URL | https://$APP_FQDN |"
  echo "| Smoke | $SMOKE_PASSED |"
} >> "$GITHUB_STEP_SUMMARY"
