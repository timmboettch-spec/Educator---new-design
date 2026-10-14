# ADR-0001: Mail Service Auth — Azure Communication Services Email + Managed Identity

## Status

Infra live in dev, qa, and prod (provisioning only for prod — not yet linked, see [Domains & DNS](#domains--dns)). Backend deploy with the ACS Email code path is live in dev/qa via `EMAIL_MODE`/normal CI; a real end-to-end test send and the prod DNS/link step are still outstanding — see [Access Required](#access-required).

## Context

The backend has gone through four states for outbound mail in quick succession — this ADR was originally split across two documents (one per intermediate state) and has been merged into one since both covered the same evolving decision (how `MailService` authenticates and what it sends through) rather than two separate architectural choices:

1. **Original**: `MailService` sent via Microsoft Graph's `sendMail` API, authenticated with `ClientSecretCredential` — a tenant-wide Entra app registration (`MailerForAzureContainers`) with a client secret stored in Key Vault (`edu-graph-client-secret`, plus tenant/client ID).
2. **PR #585** (merged into `dev`, then reverted): replaced Graph entirely with Azure Communication Services **SMTP AUTH** (`smtp.azurecomm.net:587`), authenticated with a static SMTP username + client secret pair (`edu-acs-smtp-username` / `edu-acs-smtp-client-secret`). Reverted because removing the old Graph secretRefs in the same change broke the Container App deploy — see [Consequences](#consequences).
3. **PR #601 (first pass)**: kept Microsoft Graph `sendMail`, but replaced `ClientSecretCredential` with `ManagedIdentityCredential` — this app's existing user-assigned identity, already used for Redis and the App Insights Query API via `AZURE_CLIENT_ID` (see `infra/modules/containerApp-backend.bicep`). Falls back to `DefaultAzureCredential` locally (`az login`) when `AZURE_CLIENT_ID` isn't set, matching the pattern already established in `TelemetryAnalyticsService`. Sender addresses moved off the shared `no-reply@realityworks.com` for all three environments onto per-environment domains (`dev.curionn.com`, `qa.curionn.com`, `realityworks.com` unchanged for prod), so dev/qa traffic is never sent from (or perceived as) the production address. This state went live in the sense that dev/qa's SPF records for Graph/M365 (`v=spf1 include:spf.protection.outlook.com ~all`) were applied, but the Graph `Mail.Send` app-role grant and mailbox provisioning steps were never completed before the decision changed again.
4. **PR #601 (current)**: switched the sending mechanism itself to **Azure Communication Services (ACS) Email**, still authenticated via managed identity (not a static secret), and still on a **customer-managed custom domain** (not the free `*.azurecomm.net` `AzureManaged` domain) — same per-env domain names #3 already adopted, no new domain names introduced.

State #2 and states #3/#4 were attempts at the same underlying goal: stop storing a static, tenant-wide client secret for mail auth. SMTP AUTH (used by #2) fundamentally requires a username/password pair over the wire — there is no OAuth/managed-identity equivalent for the SMTP transport itself, which is why #2 was a dead end even before the deploy-break forced its revert. #4 is the one that actually lands the "no static secret" goal cleanly: ACS Email's **REST API** (`@azure/communication-email`'s `EmailClient`) accepts a normal Entra token, including one minted for a managed identity's own service principal — the same pattern already used for Redis and the App Insights Query API elsewhere in this app.

This is the same underlying ACS resource type PR #585 provisioned — it was reverted, but not because ACS itself was the problem: it was reverted because removing the old Graph secretRefs in the same change broke the Container App deploy (`ContainerAppSecretInUse` — Container Apps refuses to remove a secret an active revision still references). State #4 explicitly avoids repeating that mistake by staying additive to infra (see [Decision](#decision)).

Separately, `src/student-backend/modules/reports/reports.service.ts` had its own second, independent mail path — a leftover from the HS-Online-AI-app sibling repo (`EMAIL_USER`/`EMAIL_PASS`/`EMAIL_HOST`/`EMAIL_PORT`, defaulting to `smtp.gmail.com`, sender `reports@realityworks.ai`). Those env vars were never actually set in any deployed environment, so in practice this path always fell through to its blob-storage fallback rather than sending real mail. State #3 consolidated that path onto the same `MailService` used everywhere else, so there's exactly one mail-sending mechanism in the repo instead of two — the existing blob-storage fallback behavior (on send failure, or when `EMAIL_MODE=file`) is preserved, and later hardened further by [ADR-0002](0002-mail-retry-queue.md)'s retry queue.

## Decision

- Send mail via ACS Email's REST API (`EmailClient(endpoint, credential).beginSend(...)`), not Graph `sendMail` and not ACS SMTP AUTH.
- Authenticate with `ManagedIdentityCredential` (this app's existing user-assigned identity), falling back to `DefaultAzureCredential` locally.
- Provision the ACS resources (`Microsoft.Communication/communicationServices`, `emailServices`, `emailServices/domains`) via `infra/modules/acsEmail.bicep`, with `domainManagement: 'CustomerManaged'` against the same per-env domains (`dev.curionn.com` / `qa.curionn.com` / `realityworks.com`).
- Grant the identity's service principal the built-in **"Communication and Email Service Owner"** role directly on the ACS Communication Services resource (Bicep-managed, not a manual per-environment step the way the Graph `Mail.Send` grant was in state #3).
- Keep the change **additive to infra** — do not remove the `GRAPH_*` secretRefs `containerApp-backend.bicep` already carries as unused-but-kept. Graph cleanup is deferred to a separate follow-up PR (see [Final Checks](#final-checks-before-calling-this-done)).
- New DNS script, `scripts/Setup-AcsDomain.ps1`, reads the ACS-required verification records (domain-ownership TXT, SPF TXT, two DKIM CNAMEs) back from the deployed Domains resource and writes them via Porkbun — same credentials/provider as `scripts/Setup-MailDomain.ps1` (state #3's SPF-only script). It explicitly merges the SPF record rather than creating a second one, since state #3's Graph SPF record already occupies that name and SPF permits only one record per domain.
- Also provisioned per domain: a `no-reply` sender username (`Microsoft.Communication/emailServices/domains/senderUsernames`), registering `MAIL_FROM`'s local part as an allowed sender — part of `acsEmail.bicep` alongside the domain resource, tagged with the org-wide `{app, component, environment, managedBy}` convention like every other resource.
- Scope: **dev, qa, and prod infra provisioning** — prod's DNS/link step is separately gated on Porkbun API access for `realityworks.com` (still blocked as of this writing; see [Access Required](#access-required)). `src/mail/mail.service.ts` itself is shared code, so any environment deploying this branch runs on ACS.
- Diagnostic settings on the Communication Services resource (`EmailSendMailOperational`/`EmailStatusUpdateOperational`/`EmailUserEngagementOperational` logs + `Traffic` metrics) flow to the same shared Log Analytics workspace Redis/Postgres already use (`modules/redisCache.bicep`'s `-to-law` pattern) — added `2026-08-31` after debugging a real send failure (`DomainNotLinked`, from `MAIL_FROM` still pointing at an unlinked domain) with no ACS-side record to correlate against, only the app's own caught-exception log line.
- `AcsMailProvider.warmUp()`, called fire-and-forget from `MailService.onModuleInit()`, pre-fetches a token for `ManagedIdentityCredential`/`DefaultAzureCredential` at boot, scope `https://communication.azure.com//.default` (double slash — the exact scope `createCommunicationAuthPolicy`'s `bearerTokenAuthenticationPolicy` requests, per `@azure/communication-common`'s source; token caches are keyed by the exact scope string, so anything else primes an unrelated cache entry the real send can't reuse — hit this exact mistake on the first attempt, which warmed a *different* scope from a different, unused ACS auth class and had zero measurable effect) — added `2026-08-31` after the first real send against a freshly deployed preview intermittently failed/timed out 4 deploys in a row (always cleared instantly on manual retest a few minutes later; one retest's own request-completed log line showed 4124ms vs. ~1-20ms for everything else in the same window, confirming a real, large, first-call-only cost rather than a flaky endpoint). The Azure SDK's auth policy only fetches a token lazily on the first real request through the pipeline; on a just-started container that means the *first* send eats the managed identity's token-fetch latency on top of the send itself. This moves that cost to startup instead, before any real request can hit it. Failures are logged, not thrown — `sendMail()` still works either way.
- `MailService`'s actual transport is behind a `MailProvider` interface (`src/mail/providers/`) selected at boot by `MAIL_PROVIDER` (`acs` default → `AcsMailProvider`, the mechanism this ADR describes; `noop` → logs and skips sending, for test/CI environments that shouldn't risk sender-domain reputation). `MAIL_FROM` is read from a dedicated `edu-acs-mail-from` Key Vault secret (written by `keyVaultSecrets.bicep` alongside the legacy `edu-mail-from`) rather than repointing `edu-mail-from` in place — same `ContainerAppSecretInUse` constraint as the `GRAPH_*` secretRefs below applied to it too, since the pre-ACS revision's own env still references `edu-mail-from`.

## Consequences

**Positive**
- No client-secret app registration, no SMTP username/password pair, no connection string, ever — across all four states, this is the one that actually lands "no static secret."
- The RBAC grant is Bicep-managed (part of the normal `resources.bicep` deploy), not a manual per-environment `az rest` step — one less manual access step per environment than state #3's Graph `Mail.Send` grant required.
- ACS Email doesn't require a real M365 mailbox for the sender address (unlike Graph, which needed `no-reply@dev.curionn.com` provisioned as an actual mailbox) — removes that manual step too.
- Dev/qa traffic is no longer sent from (or perceived as) the production mailbox address.

**Negative / risk**
- **Blue/green revision hazard** (hit twice already — PR #585 and an earlier pass at #601): this app runs Container Apps in `Multiple` revisions mode with a stable/canary split, and Azure Container Apps refuses to remove a secret from the app while *any* active revision — including the old stable one — still references it (`ContainerAppSecretInUse`). Every state transition above has stayed additive to infra for exactly this reason.
- **SPF has two historical consumers on the same domain** (state #3's Graph SPF record, this state's ACS SPF requirement) that must be merged into one record, not left as two — SPF permits only one `v=spf1` record per domain. `scripts/Setup-AcsDomain.ps1`'s merge step is the mitigation; forgetting to run it (or re-running `Setup-MailDomain.ps1 -Apply` afterward without re-checking) would silently drop the ACS mechanism and break delivery.
- Domain verification is asynchronous and can take time to propagate/verify after DNS is written — mail sending will fail (or queue/fail depending on ACS's behavior) until the domain's `verificationStates` all report `Verified`.
- `ManagedIdentityCredential` only works when running on an Azure resource carrying that identity — no local equivalent; `DefaultAzureCredential` needs the same RBAC role granted to your own account to send for real from a laptop.
- **Four sending-mechanism states in two PRs** leave stale references in docs/scripts from prior ones if not cleaned up — see the "Superseded" callout in `docs/DEPLOYMENT.md`.

## Cost

| Item | Cost delta |
|------|-----------|
| Communication Services + Email Communication Service resources (dev, qa, prod) | ACS Email pricing is consumption-based per email sent/recipient — negligible at this app's transactional volume (invites, reports). No fixed resource cost for the Communication Services/Email Service resources themselves. |
| Managed identity (reused, not new) | $0 — same user-assigned identity already attached to each Container App for Redis/App Insights auth. |
| RBAC role assignment | $0 — role assignments aren't billed. |
| Porkbun DNS (SPF/DKIM/domain-verification records) | $0 — DNS record creation has no incremental cost on an already-registered/renewed domain. |
| Entra app registration (`MailerForAzureContainers`) | Retired — no cost either way (app registrations aren't billed), but one fewer credential to track/rotate operationally once the deferred Graph secretRef cleanup lands. |
| Engineering/ops time | Each environment needs a one-time Bicep deploy (creates the ACS resources + grants the RBAC role automatically) and a one-time DNS verification pass via `Setup-AcsDomain.ps1`. No recurring manual grant needed after that, unlike state #3's Graph `Mail.Send` step. |

## Domains & DNS

| Env | Sender domain | Registrar | ACS verification status |
|-----|----------------|-----------|--------------------------|
| dev | `dev.curionn.com` | Porkbun (`curionn.com`) | **Verified & linked** (Domain/SPF/DKIM/DKIM2 all `Verified`) |
| qa | `qa.curionn.com` | Porkbun (`curionn.com`) | **Verified & linked** (Domain/SPF/DKIM/DKIM2 all `Verified`) |
| prod | `realityworks.com` | Porkbun (`realityworks.com`) | ACS resources provisioned (Communication Services, Email Service, Domain, RBAC, sender username) but domain **not linked** — blocked on Porkbun API access for `realityworks.com` (confirmed still not opted in; `realityworksai.com`, a different domain used for app hosting, does have access) |

`scripts/Setup-AcsDomain.ps1 -Environment <dev\|qa\|prod>` reads the Domains resource's `verificationRecords` (Domain/SPF/DKIM/DKIM2) and writes them via Porkbun — merging the SPF record with the existing Graph-era SPF record where one exists, and creating the DKIM CNAMEs / domain-verification TXT fresh. Defaults to a dry run; `-Apply` (and `-Force` for the SPF merge) actually writes. After writing, it calls `az communication email domain initiate-verification` per record type.

**Issues found and fixed during the dev/qa rollout:**
- The script's TXT-record sync originally deleted *every* existing record at a host name before writing the new one — safe for the DKIM CNAMEs (dedicated selector names) but not for the domain-verification TXT, which shares its host with the SPF record. This silently deleted the live SPF record on dev mid-rollout; restored by hand and the script now requires a content-prefix match (`-StalePrefixMatch`) before deleting anything for TXT types, so an unrelated record at the same name is never touched.
- ACS's SPF verification got stuck in `VerificationInProgress` (eventually `VerificationFailed`) on both dev and qa while the record used the Graph-era `~all` (soft-fail) qualifier, and passed within one verification cycle once switched to `-all` (hard-fail) — the exact qualifier ACS's own `verificationRecords.SPF.value` asks for. `Setup-AcsDomain.ps1` already writes `-all` on a fresh create; only the merge path (an existing record with a different qualifier) needs manual attention if this recurs for prod.
- Linking a `CustomerManaged` domain to the Communication Services resource also requires **all** verification record types (not just `Domain`) to be `Verified` first — confirmed by two failed link attempts against dev while SPF was still pending. `acsEmail.bicep`'s `linkCustomDomain` param defaults to `false` for exactly this reason — provision first, verify DNS, then redeploy with `linkCustomDomain: true`.
- A standalone `az deployment group create --template-file infra/modules/acsEmail.bicep` invocation (used for the provision-then-link two-phase flow) must pass `-tags` explicitly — it defaults to `{}` and won't match the org-wide `{app, component, environment, managedBy}` convention otherwise (hit once for dev/qa/prod, fixed after the fact with a tags-only redeploy; see the module's own header comment). It must also pass `-workspaceId` (the shared Log Analytics workspace's resource ID, e.g. `law.id` from `resources.bicep`) since `2026-08-31`'s diagnostic-settings addition made it a required param with no default.

## Access Required

1. ~~Deploy `infra/modules/acsEmail.bicep` for dev/qa/prod~~ — **done**. Creates the Communication Services + Email Communication Service + Domain + sender-username resources and grants the RBAC role; no manual Entra step needed. Domain linking is a separate `linkCustomDomain: true` follow-up deploy, gated on verification.
2. ~~Run `scripts/Setup-AcsDomain.ps1` + verify (dev, qa)~~ — **done**.
3. **Porkbun: enable API access for `realityworks.com`.** Confirmed blocker as of this writing — same class of manual, non-API-able toggle `curionn.com` needed (Account Settings → API Access). No API path around it.
4. **Run `scripts/Setup-AcsDomain.ps1 -Environment prod`** (dry run first, review carefully — `realityworks.com` carries the company's real M365 mail with a strict `DMARC p=reject` policy, so the SPF merge step needs particular care) once #3 lands, then link the domain.
5. **Deploy the updated backend image to dev and qa and confirm a real end-to-end test send.** Still outstanding.

## Final Checks (before calling this done)

- [x] `infra/modules/acsEmail.bicep` deployed for dev, qa, and prod (prod: provisioning only, not linked)
- [x] `Setup-AcsDomain.ps1` run for dev and qa (SPF merge/no-op as applicable)
- [x] `verificationStates` for dev's and qa's domains all report `Verified`
- [x] dev/qa domains linked to their Communication Services resources
- [ ] Porkbun API access enabled for `realityworks.com`
- [ ] `Setup-AcsDomain.ps1 -Environment prod` run and verified; prod domain linked
- [x] Dev backend redeployed with `ACS_ENDPOINT` wired; real test email sent and received end-to-end (`POST /auth/forgot-password` against the live preview → `201 SUCCESS` → OTP email confirmed received in a real inbox)
- [ ] Qa backend redeployed; same test
- [x] Graph cleanup, application-code side: removed `src/common/config/graph.config.ts` (dead — nothing read the `graph.*` namespace once `mail.service.ts` moved to ACS) and the unused `@microsoft/microsoft-graph-client` npm dependency
- [ ] Graph cleanup, infra side: `edu-graph-*` secretRefs in `containerApp-backend.bicep` — still deliberately kept (same `ContainerAppSecretInUse` reasoning as `edu-mail-from` above); drop once the pre-ACS revision rotates out

## Addendum (2026-09-07): naming rename, new domains, Porkbun blocker resolved

Everything above (`acs-rwai-edu-{env}`, `dev.curionn.com`/`qa.curionn.com`, dev's live cutover) is still the **current running state** — nothing below has been cut over to the app yet.

- **Item 3 above was wrong**: Porkbun API access for `realityworks.com` is *not* blocked — a domain-ownership TXT, SPF check, and two DKIM CNAMEs were all written and verified against it without issue. Whatever the earlier "not opted in" finding was based on, it no longer holds (or never did) for this account/domain.
- Separately, `acs-rwai-edu-{env}(-mail)` was renamed to `acs-{env}-rwai-edu(-mail)` (matching `docs/standards/AZURE-NAMING-CONVENTION.md`, and the same rename applied in Crexo-Educator-Backend), and dev/qa moved off the shared `curionn.com` apex onto per-workload subdomains: `dev.rwai.curionn.com` / `qa.rwai.curionn.com`. Prod stays on `realityworks.com`, unchanged.
- New `acs-{env}-rwai-edu(-mail)` resources have been created, DNS-verified (Domain/SPF/DKIM/DKIM2 all `Verified`), and linked for **all three environments including prod** — created additively, without touching or deleting the old `acs-rwai-edu-{env}` resources, so dev's live mail path (this ADR's checklist above) kept working throughout.
- `realityworks.com`'s existing SPF record already granted the `include:spf.protection.outlook.com` mechanism ACS needs (from the M365/HubSpot/NetSuite SPF combination already there), so no SPF write was needed there at all — only a new domain-ownership TXT (added alongside the existing `ms-domain-verification=...` from the old resource) and two DKIM CNAMEs (which didn't already exist under the new resource's exact required name).
- **Not done yet**: repointing the running container apps (dev/qa/prod) at the new resources — that means updating `mailFrom` in `infra/env/*.bicepparam` (dev/qa only; prod's is already `no-reply@realityworks.com`) and re-provisioning each environment. Tracked as a separate PR/step from the one that introduced this rename.
