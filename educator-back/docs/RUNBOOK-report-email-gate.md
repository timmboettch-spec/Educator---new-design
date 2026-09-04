# Runbook — "Student Report Available" email gate (prod)

Deploying the report-email gate and driving the `REPORT_EMAILS_DISABLED` kill
switch on the prod Container App.

**Scope:** stops *new* report email. See [Caveat 1](#caveat-1--this-stops-new-mail-it-does-not-drain-the-backlog).

---

## 0. Values you must fill in

| Placeholder | Where to get it | Expected value |
|---|---|---|
| `<SUBSCRIPTION_ID>` | `az account list -o table` | — |
| `<RG>` | Naming table, `docs/DEPLOYMENT.md:88` | `ARG-prod1-rwai` |
| `<APP>` | Derived from `infra/resources.bicep:80` | `aca-prod1-rwai-eduback` |

> [!WARNING]
> **The app name in `README.md` is stale.** `README.md:48` and
> `docs/DEPLOYMENT.md:163` say `aca-prod1-edu-back` (and RG `ARG-prod1-edu`).
> `infra/resources.bicep:80` builds the name as
> `aca-${environment}${azureVersion}-${prefix}-${app}back` →
> **`aca-prod1-rwai-eduback`** in **`ARG-prod1-rwai`**. Confirm before trusting
> either — do not skip step 0.1.

### 0.1 Resolve the real names (do this first)

```bash
az account set --subscription <SUBSCRIPTION_ID>

# List every Container App in the subscription; identify the prod backend.
az containerapp list --query "[].{name:name, rg:resourceGroup, fqdn:properties.configuration.ingress.fqdn}" -o table
```

Pick the row whose `fqdn` serves `educatorbe.realityworksai.com`. Use that
`name`/`rg` as `<APP>`/`<RG>` everywhere below.

### 0.2 Confirm the prod test-school name (closes the last open risk)

The gate matches `schools.school_name` against `Beta Test` / `Test` on whole
words. That name was **never verified against prod data** — there is no
"Beta Test" school in the local DB. Confirm what the automation actually uses:

```sql
-- against educator_prod
SELECT s.id, s.school_name, count(DISTINCT e.id) AS educators
FROM schools s
LEFT JOIN educators e ON e.school_id = s.id
GROUP BY s.id, s.school_name
ORDER BY s.school_name;
```

If the real name has no standalone `test` token (e.g. `RW-Automation`), the
gate **will not fire**. Set `REPORT_EMAILS_TEST_SCHOOLS` to the real name in
step 3 rather than relying on the default.

---

## 1. Deploy the build

Deployment is GitHub Actions, triggered by branch push
(`.github/workflows/deploy-backend.yml`, `branches: [dev, qa, main]`).
`main` → prod. Flow: lint ratchet → `az acr build` → `az deployment group`
(`infra/app-deploy.bicep`) → health → smoke.

```bash
# From a clean checkout, with the gate commit on main:
git push origin main

# Watch it:
gh run watch $(gh run list --workflow=deploy-backend.yml --branch=main --limit=1 --json databaseId -q '.[0].databaseId')
```

Manual trigger (same workflow, explicit env):

```bash
gh workflow run deploy-backend.yml -f environment=prod
```

Confirm the new revision is live and healthy:

```bash
az containerapp revision list -n <APP> -g <RG> \
  --query "[?properties.active].{rev:name, created:properties.createdTime, healthy:properties.healthState, traffic:properties.trafficWeight}" -o table

curl -sS https://educatorbe.realityworksai.com/health
```

> Health-check `/health`, **not** `/readyz` — `/readyz` reports `redis: error`
> when Redis is merely unconfigured.

**At this point test-school email is already gated.** The default
`Beta Test,Test` patterns are compiled in; no env var is required for the
test-traffic case. Step 2 is only for the blanket stop.

---

## 2. Blanket stop — `REPORT_EMAILS_DISABLED=true`

Use this to halt **all** report email, including real educators, while the
mailbox recovers.

### 2a. Fast path (imperative — minutes)

```bash
az containerapp update -n <APP> -g <RG> \
  --set-env-vars REPORT_EMAILS_DISABLED=true
```

This creates a new revision and restarts the app. Verify it took:

```bash
az containerapp show -n <APP> -g <RG> \
  --query "properties.template.containers[0].env[?name=='REPORT_EMAILS_DISABLED']" -o json
```

> [!CAUTION]
> **This is still reverted by the next deploy.** `infra/app-deploy.bicep`
> reconciles the full env block on every run and will reset the var to the
> Key Vault value. Fine as a deliberate auto-expiring emergency brake; for a
> setting that must persist, change the KV secret instead — see 2b.

### 2b. Durable path (Bicep — now wired)

Both variables are declared in infra, so the per-deploy reconcile no longer
strips them:

| File | What it does |
|---|---|
| `infra/env/{dev,qa,prod}.bicepparam` | `reportEmailsDisabled = 'false'`, `reportEmailsTestSchools = 'Beta Test,Test'` |
| `infra/main.bicep` | params (defaults `'false'` / `'Beta Test,Test'`) → `resources.bicep` |
| `infra/resources.bicep` | threads both into the `keyVaultSecrets` module |
| `infra/modules/keyVaultSecrets.bicep` | writes `edu-report-emails-disabled`, `edu-report-emails-test-schools` |
| `infra/modules/containerApp-backend.bicep` | adds both to `kvSecretNames` + `env` via `secretRef` |

`app-deploy.bicep` delegates to `containerApp-backend.bicep`, so the same
declaration covers both the per-deploy reconcile and a full provision.

> [!CAUTION]
> **Provision before you deploy — order matters.**
> The KV secrets are written by `main.bicep` (provision path). The `secretRef`
> that consumes them is applied by `app-deploy.bicep` (every deploy). If a
> deploy lands first, the new revision references two Key Vault secrets that do
> not exist yet, fails to resolve them, and **will not start**. The blue/green
> staging gate should keep traffic on the stable revision, but the deploy fails.
>
> Correct order:
> ```bash
> # 1. Provision — creates the two KV secrets.
> pwsh scripts/Provision-Bicep.ps1 -Environment prod
> #    (or: az deployment sub create -t infra/main.bicep -p infra/env/prod.bicepparam)
>
> # 2. Confirm they exist before merging the app change.
> az keyvault secret show --vault-name akvprod1rwai --name edu-report-emails-disabled --query value -o tsv
> az keyvault secret show --vault-name akvprod1rwai --name edu-report-emails-test-schools --query value -o tsv
>
> # 3. Then deploy (step 1).
> ```

### Changing the values durably

Because the env vars are now KV-backed, the durable way to flip them is to
update the Key Vault secret and restart — not `--set-env-vars`:

```bash
az keyvault secret set --vault-name akvprod1rwai --name edu-report-emails-disabled --value true
az containerapp revision restart -n <APP> -g <RG> --revision <CURRENT_REVISION>
```

Update the matching `.bicepparam` in the same change, or the next provision
will write the old value back.

---

## 3. Flip back to normal

Once the mailbox is clear, restore normal sending so real educators get their
reports again. The test-school gate keeps working — it is independent of this
switch.

```bash
az containerapp update -n <APP> -g <RG> \
  --set-env-vars REPORT_EMAILS_DISABLED=false
```

If step 0.2 turned up a different school name, set it in the same call:

```bash
az containerapp update -n <APP> -g <RG> \
  --set-env-vars REPORT_EMAILS_DISABLED=false "REPORT_EMAILS_TEST_SCHOOLS=Beta Test,Test,<REAL_NAME>"
```

Only the exact string `true` disables. Any other value — `1`, `TRUE`, unset —
means normal sending.

---

## 4. Verification

Trigger **one** report for a student in the Beta-Test school, then check logs.
Every notification logs a `firing →` line before the email block; a gated one
logs `email suppressed` immediately after. **The pair is the signal.**

### Live tail

```bash
az containerapp logs show -n <APP> -g <RG> --type console --follow --tail 200 \
  | grep -E "notifyEducatorReportAvailable"
```

### Log Analytics (after the fact)

```bash
az monitor log-analytics query \
  --workspace <LOG_ANALYTICS_WORKSPACE_ID> \
  --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(30m) | where Log_s contains 'notifyEducatorReportAvailable' | project TimeGenerated, Log_s | order by TimeGenerated desc" \
  -o table
```

### Reading the result

| What you see | Meaning |
|---|---|
| `firing → educator=…` **and** `email suppressed (test school "Beta Test") → educator=…` | ✅ **Gate fired.** No mail was attempted. |
| `firing → educator=…` **and** `email suppressed (REPORT_EMAILS_DISABLED)` | ✅ Kill switch active — all report mail stopped. |
| `firing → educator=…` with **no** `email suppressed` for that educator | ❌ **Gate missed.** `sendMail` was called. See below. |
| `email failed for educator=…` | ❌ Gate missed *and* the send errored — still an attempt. |

Exact grep for the success case:

```bash
az containerapp logs show -n <APP> -g <RG> --type console --tail 500 \
  | grep "email suppressed"
```

> Absence of email in the mailbox is **not** proof. Mail can fail for unrelated
> reasons (Graph creds, throttling), which looks identical to a working gate.
> The `email suppressed` log line is the only positive evidence.

### If the gate missed

Almost certainly the school name. Run step 0.2, then set
`REPORT_EMAILS_TEST_SCHOOLS` to the real value (step 3). Matching is
whole-word: `Beta Test School` matches, `Betamax Testing` does not.

---

## 5. Rollback

```bash
# Stop all report email immediately (fastest lever):
az containerapp update -n <APP> -g <RG> --set-env-vars REPORT_EMAILS_DISABLED=true

# Or revert to the previous revision entirely:
az containerapp revision list -n <APP> -g <RG> -o table
az containerapp ingress traffic set -n <APP> -g <RG> --revision-weight <PREVIOUS_REVISION>=100
```

---

## Caveats

### Caveat 1 — this stops *new* mail, it does not drain the backlog

The code change prevents further sends. Messages already queued or sitting in
`no-reply@realityworks.com` still have to clear on their own or be purged
Exchange-side by whoever administers the mailbox. If the mailbox is blocked by
backlog volume rather than send rate, deploying this alone will not unblock the
Strawbees customers — escalate the purge in parallel.

### Caveat 2 — one extra join per notification

The gate loads `schoolAssignments` + `schoolAssignments.school` on every report
notification. Negligible at normal volume; worth knowing if report throughput
is ever the bottleneck.

### Caveat 3 — the admin block is not email

`notifyAdminStudentReportAvailable` (`notifications.gateway.ts:477`) writes a DB
row and emits a websocket event. It sends no mail and is deliberately not
gated — coupling it to the kill switch would mute real admins' in-app
notifications for zero mailbox benefit.

`emailReportPdfByStudentId()` does send mail but is manually triggered per
request, not part of the automatic flood. Also not gated.
