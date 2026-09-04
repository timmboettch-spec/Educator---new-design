#!/usr/bin/env bash
# Aggregated Teams notification: resolve a GitHub login to an Entra @mention
# (RW Thrive SCIM convention: firstname-lastname_rwthrive → firstname.lastname@rwthrive.com),
# then post an Adaptive Card. No-op when WEBHOOK_URL is empty.
set -euo pipefail

if [ -z "${WEBHOOK_URL:-}" ]; then
  echo "No webhook configured — skipping Teams notification"
  exit 0
fi

# ---- resolve mention -------------------------------------------------------
MENTION_UPN=""
MENTION_NAME="${GH_LOGIN:-}"
case "${GH_LOGIN:-}" in
  *_rwthrive)
    BASE="${GH_LOGIN%_rwthrive}"
    MENTION_UPN="${BASE//-/.}@rwthrive.com"
    MENTION_NAME=$(echo "$BASE" | awk -F- '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)} print}' OFS=' ')
    ;;
esac

# ---- build + post card -----------------------------------------------------
# The mention line only renders when a prefix/suffix is supplied — callers
# that want no mention line at all (e.g. a success card with no ping) pass
# both empty. When github-login doesn't resolve to an Entra UPN, the line
# still renders with the plain login name instead of silently disappearing,
# matching notify-pending-approval.yml / sast.yml's "Submitted by X" fallback.
PAYLOAD=$(jq -n \
  --arg headline "$HEADLINE" \
  --arg style "$STYLE" \
  --arg subtitle "${SUBTITLE:-}" \
  --arg mentionName "$MENTION_NAME" \
  --arg mentionUpn "$MENTION_UPN" \
  --arg mentionPrefix "${MENTION_PREFIX:-}" \
  --arg mentionSuffix "${MENTION_SUFFIX:-}" \
  --arg footer "${FOOTER:-}" \
  --argjson facts "${FACTS_JSON:-[]}" \
  --argjson actions "${ACTIONS_JSON:-[]}" \
  '
  ($subtitle != "") as $hasSubtitle |
  ($mentionName != "" and $mentionUpn != "") as $hasMention |
  ($mentionName != "" and ($mentionPrefix != "" or $mentionSuffix != "")) as $hasMentionLine |
  ($mentionPrefix + (if $hasMention then "<at>" + $mentionName + "</at>" else $mentionName end) + $mentionSuffix) as $mentionLineText |
  ($footer != "") as $hasFooter |
  # Teams Workflows (the Power Automate-backed webhook that replaced classic
  # Office 365 Connectors) feeds the "Post card in a chat or channel" action
  # straight from the request body, so the body must BE the Adaptive Card —
  # not the old connector envelope ({type:"message", attachments:[...]}).
  # Wrapping it makes the flow see root type "message" instead of
  # "AdaptiveCard" and fail with AdaptiveSerializationException.
  (
    {
      ("$schema"): "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: (
        [
          {
            type: "Container",
            style: $style,
            items: (
              [{type:"TextBlock", text:$headline, weight:"Bolder", size:"Medium", wrap:true}]
              + (if $hasSubtitle then [{type:"TextBlock", text:$subtitle, wrap:true, spacing:"Small", isSubtle:true}] else [] end)
              + (if $hasMentionLine then [{type:"TextBlock", text: $mentionLineText, wrap:true, spacing:"Small"}] else [] end)
            )
          },
          {type:"FactSet", facts: $facts}
        ]
        + (if $hasFooter then [{type:"TextBlock", text:$footer, isSubtle:true, size:"Small", wrap:true}] else [] end)
      ),
      actions: $actions
    }
    # Teams requires every msteams.entities[].text to appear literally in the
    # card body, or the flow Post card action fails with BadArgument:
    # "One or more mention entity could not be found in card text". hasMention
    # only means the login resolved to an Entra UPN — it says nothing about
    # whether the <at> tag actually got rendered anywhere (a caller can
    # resolve a mention but suppress the mention line by leaving both
    # mention-prefix and mention-suffix empty). Gate on hasMentionLine, the
    # thing that actually controls whether <at>Name</at> is in the body.
    + (if $hasMention and $hasMentionLine then
        {msteams: {entities: [{type:"mention", text: ("<at>" + $mentionName + "</at>"), mentioned: {id: $mentionUpn, name: $mentionName}}]}}
      else {} end)
  )
  ')

# Check the trigger's own response instead of assuming success: previously
# this always printed "posted" regardless of what curl actually got back, so
# a rejected/malformed request looked identical to a real success in the
# Actions log. Note this still only confirms the Power Automate HTTP trigger
# ACCEPTED the request (typically HTTP 202) — a Teams Workflow trigger
# responds before the flow finishes running, so a downstream action failure
# inside the flow itself (e.g. "Post card in a chat or channel" rejecting
# the card) will still show green here. Check the flow's own run history in
# Power Automate to confirm the card actually rendered.
RESPONSE_FILE=$(mktemp)
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" --connect-timeout 10 --max-time 30 -H "Content-Type: application/json" -d "$PAYLOAD" "$WEBHOOK_URL")
RESPONSE_BODY=$(cat "$RESPONSE_FILE")
rm -f "$RESPONSE_FILE"

echo "Webhook trigger responded: HTTP $HTTP_STATUS"
[ -n "$RESPONSE_BODY" ] && echo "Response body: $RESPONSE_BODY"

if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
  echo "::error::Teams webhook trigger rejected the request (HTTP $HTTP_STATUS): $RESPONSE_BODY"
  exit 1
fi

echo "Teams card posted (mention: ${MENTION_NAME:-none}, HTTP $HTTP_STATUS)"
