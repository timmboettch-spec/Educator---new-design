#!/usr/bin/env bash
set -euo pipefail

# Build the fully-qualified tag refs: {registry}/{image-name}:{tag}
REFS=()
while IFS= read -r TAG; do
  [ -z "$TAG" ] && continue
  REFS+=("${REGISTRY}/${IMAGE_NAME}:${TAG}")
done <<< "$TAGS"

if [ "${#REFS[@]}" -eq 0 ]; then
  echo "::error::No tags provided — cannot build image"
  exit 1
fi

ALL_TAGS=$(IFS=,; echo "${REFS[*]}")

echo "image-ref=${REFS[0]}" >> "$GITHUB_OUTPUT"
echo "all-tags=$ALL_TAGS"   >> "$GITHUB_OUTPUT"

{
  echo 'tags-multiline<<EOF'
  printf '%s\n' "${REFS[@]}"
  echo 'EOF'
} >> "$GITHUB_OUTPUT"
