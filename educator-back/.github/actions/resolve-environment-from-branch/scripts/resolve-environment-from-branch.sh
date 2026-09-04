#!/usr/bin/env bash
set -euo pipefail

if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  ENVIRONMENT="$DISPATCH_ENVIRONMENT_INPUT"
else
  BRANCH="${REF#refs/heads/}"

  # Exact match first.
  ENVIRONMENT=$(echo "$BRANCH_ENVIRONMENT_MAP" | jq -r --arg branch "$BRANCH" '.[$branch] // empty')

  # Fall back to a "prefix/*" wildcard-style key, matched via a simple string
  # prefix check (not full glob).
  if [ -z "$ENVIRONMENT" ]; then
    while IFS=$'\t' read -r KEY VALUE; do
      [ -z "$KEY" ] && continue
      case "$KEY" in
        */\*)
          PREFIX="${KEY%/\*}/"
          if [[ "$BRANCH" == "$PREFIX"* ]]; then
            ENVIRONMENT="$VALUE"
            break
          fi
          ;;
      esac
    done < <(echo "$BRANCH_ENVIRONMENT_MAP" | jq -r 'to_entries[] | "\(.key)\t\(.value)"')
  fi
fi

if [ -z "$ENVIRONMENT" ]; then
  echo "::error::Unknown branch for deployment"
  exit 1
fi

PREFIX=$(echo "$ENV_PREFIX_MAP" | jq -r --arg env "$ENVIRONMENT" '.[$env] // empty')
if [ -z "$PREFIX" ]; then
  PREFIX="$DEFAULT_PREFIX"
fi

RESOURCE_GROUP="ARG-${ENVIRONMENT}${AZ_VERSION}-${PREFIX}"
KEY_VAULT="akv${ENVIRONMENT}${AZ_VERSION}${PREFIX}"
STORAGE_ACCOUNT="asa${ENVIRONMENT}${AZ_VERSION}${PREFIX}"

{
  echo "environment=$ENVIRONMENT"
  echo "prefix=$PREFIX"
  echo "resource-group=$RESOURCE_GROUP"
  echo "key-vault=$KEY_VAULT"
  echo "storage-account=$STORAGE_ACCOUNT"
} >> "$GITHUB_OUTPUT"

echo "Resolved environment=$ENVIRONMENT prefix=$PREFIX resource-group=$RESOURCE_GROUP"
