# Daily Snapshot — one-time prod setup walkthrough

This is the local runbook for turning the daily snapshot job on in prod for
the first time. Background on what the job does and how it's wired lives in
[`WEEKLY-SNAPSHOT.md`](./WEEKLY-SNAPSHOT.md) — read that first if you
haven't.

## Prerequisites

- `pwsh` 7+ on your machine.
- Azure CLI, logged in (`az login`) with Contributor on `ARG-prod1-rwai`.
- Org **admin** rights on `Realityworks-AI` (needed to create a GitHub App
  scoped to the org).
- A browser on the same machine (GitHub App creation and installation each
  need one human click — there's no pure-API path around either).
- `gh` CLI, logged in (`gh auth login`) — only used to create the snapshot
  repo if it doesn't exist yet.
- (Optional, for Teams notifications) Access to create a Workflow in the
  **08 - RW AI - Gate Information** Teams channel — see
  [step 6](#6-optional-teams-notifications) below.

## Option A — one script (recommended)

```bash
# if the repo doesn't exist yet
gh repo create Realityworks-AI/student-app-scenario-snapshot --private
```

```powershell
pwsh ./scripts/New-SnapshotGitHubApp.ps1
```

This does everything else in one go, using GitHub's App "manifest flow":

1. Opens your browser to a page that auto-submits the App's manifest (name,
   `Contents: Read & write` + `Pull requests: Read & write` permissions, no
   webhook) to GitHub for the `Realityworks-AI` org. **You click "Create
   GitHub App."**
2. GitHub redirects back to a local listener with a one-time code; the
   script exchanges it for the App's ID and private key automatically — no
   copy-pasting an App ID, no manually downloading a `.pem`.
3. Opens your browser to the App's install page. **You pick the org, select
   `student-app-scenario-snapshot`, click Install.**
4. Polls the GitHub API (as the App) until the installation shows up, then
   hands off to `Provision-Snapshot-Prod.ps1`, which verifies the App can
   mint an installation token and runs `Provision-Bicep.ps1 -Environment prod`.

Total manual effort: two browser clicks. If the default App name
(`student-app-scenario-snapshot-bot`) is already taken by someone else on
GitHub (names are global, not just within the org), rerun with
`-AppName student-app-scenario-snapshot-bot-rwai` or similar — the script
will tell you if this happens.

Both permissions (`Contents`, `Pull requests`) are requested up front in the
manifest, so a brand-new App created this way needs no follow-up
permission-approval step — that's only required when *adding* a permission
to an App that's already installed (see
[step 6](#6-optional-teams-notifications) below for why that matters if you
add Teams notifications later).

Want to check things first without touching Azure? Add `-VerifyOnly`. Want
to see what would be set without provisioning OR you haven't logged into
`az` yet? Add `-DryRun`. Want Teams notifications wired in from the start?
Add `-TeamsWebhookUrl 'https://...'` (and optionally `-TeamsMention
'someone@rwthrive.com'` — see [step 6](#6-optional-teams-notifications)).

Once it finishes, delete the `.pem` file it saved (`./snapshot-app-key.pem`
by default) — the key now lives only in prod's Key Vault
(`snap-git-app-private-key`), read by the job's managed identity.

Then skip to [confirming it works](#confirming-it-works) below.

## Option B — manual walkthrough (fallback)

Use this if Option A's local listener can't work in your environment (e.g.
no browser reachable from this machine at all), or if you just want to see
every step explicitly.

### 1. Create the private snapshot repo

```bash
gh repo create Realityworks-AI/student-app-scenario-snapshot --private
```

Leave it empty — the job's first run creates the initial commit.

### 2. Create the GitHub App

Go to **https://github.com/organizations/Realityworks-AI/settings/apps/new**
and fill in:

| Field | Value |
|---|---|
| GitHub App name | `student-app-scenario-snapshot-bot` (must be globally unique on GitHub — add a suffix if taken) |
| Homepage URL | anything, e.g. `https://github.com/Realityworks-AI/Educator-App-Backend` |
| Webhook → Active | **unchecked** — this App never receives webhooks |
| Repository permissions → Contents | **Read and write** |
| Repository permissions → Pull requests | **Read and write** — the job lands each run via branch + PR + squash-merge (see `WEEKLY-SNAPSHOT.md`), not a direct push, so this is required alongside Contents |
| Where can this GitHub App be installed? | **Only on this account** |

Click **Create GitHub App**. On the App's settings page, note the **App ID**
shown near the top (a small number, e.g. `123456`) — that's `GitAppId` below,
not secret.

> **Adding this permission later, to an already-installed App?** Adding a
> permission is different from requesting it up front at creation time —
> GitHub requires the org to explicitly re-approve the increase before it
> takes effect (Settings & events → change the permission → **Save
> changes** → the org owner then approves the pending request, usually
> surfaced as an email and/or a banner on
> `https://github.com/organizations/Realityworks-AI/settings/installations`).
> Confirm it actually took effect by checking
> `GET /app/installations/{installation_id}` (as an App JWT, not a personal
> token) shows `pull_requests` in `permissions` — the job's PR step will
> fail with a 403 until it does.

### 3. Generate and download the private key

Still on the App's settings page, scroll to **Private keys** → **Generate a
private key**. This downloads a `.pem` file — save it somewhere temporary on
your machine (e.g. `~/snapshot-app-key.pem`). Treat it like a password.

### 4. Install the App on the snapshot repo

On the App's settings page, click **Install App** in the left sidebar, choose
the `Realityworks-AI` org, and select **Only select repositories** →
`student-app-scenario-snapshot`. Confirm.

### 5. Provision

```powershell
pwsh ./scripts/Provision-Snapshot-Prod.ps1 `
  -GitAppId 123456 `
  -GitAppPrivateKeyPath ~/snapshot-app-key.pem
```

This resolves the installation ID automatically, verifies the App can mint
an installation token, then runs `Provision-Bicep.ps1 -Environment prod`
with the `SNAPSHOT_*` env vars set. Add `-VerifyOnly` to check without
provisioning. See [step 6](#6-optional-teams-notifications) for the two
Teams-related flags.

Once done, delete the local `.pem` file.

### 6. (Optional) Teams notifications

The job posts to Teams via `-TeamsWebhookUrl` — **tagged (with a real
`@mention`, if `-TeamsMention` is also set) on failure**, **untagged on
success**. Nothing is sent anywhere if you skip this entirely; the job just
runs silently, same as before.

**Getting the webhook URL** — modern Teams channels use a **Workflow**, not
the deprecated classic "Incoming Webhook" connector:

1. In the target channel (e.g. **08 - RW AI - Gate Information**), open
   **Workflows** (from the channel's `...` menu, or the Workflows app in
   Teams's left sidebar).
2. Search for a webhook-to-channel template — Microsoft has named this
   template differently across Teams versions (seen as *"Send webhook
   alerts to a channel"* and *"Post to a channel when a webhook request is
   received"*); pick whichever one posts an incoming webhook payload to a
   channel.
3. Select the target **Team** and **Channel**, then **Save**.
4. You're redirected to the workflow's details page — **copy the webhook
   URL** shown there. Treat it like a credential (it lets anyone who has it
   post into that channel).

**Why this matters for the payload format**: this endpoint is a Power
Automate flow trigger, not a classic connector — `entrypoint.ps1`'s
`Send-TeamsNotification` already sends the exact Adaptive Card schema this
expects (confirmed working; see `.github/actions/teams-notify/scripts/teams-notify.sh`
for the same pattern used elsewhere in this repo). If you ever rewrite that
function, the request body must **be** the Adaptive Card itself
(`type: "AdaptiveCard"`), not the old `{type:"message", attachments:[...]}`
connector envelope — wrapping it fails with `AdaptiveSerializationException`.

**Real `@mention` on failure** — pass `-TeamsMention 'someone@rwthrive.com'`
(a UPN/email). Confirmed working end-to-end (a real Teams ping, not just a
visible card) as long as the mentioned person is a member of the target
channel/team. Leave it unset for a visually distinct (red) card with no
ping.

```powershell
pwsh ./scripts/Provision-Snapshot-Prod.ps1 `
  -GitAppId 123456 `
  -GitAppPrivateKeyPath ~/snapshot-app-key.pem `
  -TeamsWebhookUrl 'https://default....environment.api.powerplatform.com:443/powerautomate/...' `
  -TeamsMention 'kavyesh.shah@rwthrive.com'
```

## Confirming it works

```bash
az containerapp job start -n acj-prod1-rwai-edusnap -g ARG-prod1-rwai
az containerapp job execution list -n acj-prod1-rwai-edusnap -g ARG-prod1-rwai -o table
```

(Or trigger it from GitHub Actions: **Actions → Trigger Snapshot Job (prod) →
Run workflow**, see `docs/WEEKLY-SNAPSHOT.md`.)

Check `gh pr list --repo Realityworks-AI/student-app-scenario-snapshot` (or
`git log` on `main`) for a new, already-merged PR — each run lands as its
own PR, not a bare commit. From here it runs on its own daily at 11:00 UTC
(~6:00 AM US Central/CDT) — nothing further to schedule. If you configured
the Teams webhook, you should also see a card in the channel.

If it fails, see the **Runbook** section in
[`WEEKLY-SNAPSHOT.md`](./WEEKLY-SNAPSHOT.md#runbook--the-snapshot-didnt-run--didnt-push).

## Re-running provisioning later

Re-running `Provision-Snapshot-Prod.ps1` at any point (e.g. to rotate the
private key, or to add Teams notifications that weren't set initially) is
safe — `Provision-Bicep.ps1` is idempotent and only touches the snapshot
resources when a non-empty `SNAPSHOT_*` value changes something. You do not
need to recreate the GitHub App or repo for a routine re-run; just
re-provide the existing `GitAppId` and PEM file (or a freshly rotated one).
Note the **empty preserves existing KV value** convention only applies to
`GitAppPrivateKeyPath`/the webhook URL — if you omit `-TeamsWebhookUrl` on a
re-run after it was already set, notifications get un-wired until you pass
it again (fetch the existing value first if you need it to persist across
a routine re-provision, e.g. `az keyvault secret show --vault-name
akvprod1rwai --name snap-teams-webhook-url --query value -o tsv`).
