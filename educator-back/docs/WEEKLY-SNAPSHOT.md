# hs-online Daily Snapshot-to-Git

A scheduled Container Apps Job that pulls the backend's individual scenario/report/transcript blobs and lands them in a private snapshot repo via a branch + PR + squash-merge, so changes to that data are visible as a readable, per-record git diff.

## What gets snapshotted (and what doesn't)

Per the actual requirement: **scenario files are the priority, and need to land daily.** Reports/transcripts are a bonus, included as long as they don't threaten that daily cadence — if a future run ever risks that (e.g. record counts grow enough that the timeout needs to keep climbing), reports/transcripts get trimmed or dropped before scenario reliability is put at risk.

Root-level flat blobs (`scenarios.json`, `default-scenarios.json`, `reports.json`, `transcripts.json`, `units.json`, `classes.json`, `conversation-responses.json`, `username-units.json`, `users.json`, `actions.json`) are **deliberately not pulled at all** — beyond just not being the priority, their tens-of-MB size is exactly what made the original weekly diffs unreadable (the whole file shows as changed on every run). Instead:

- `en/scenario/<id>.json`, `es/scenario/<id>.json` — the actual source of truth for scenario content (`json-data.service.ts`'s `loadAllScenarioFiles` explicitly calls `scenarios.json` a legacy fallback, not the live data).
- `reports/<id>.json`, `transcripts/<id>.json` — individual per-record blobs the backend already dual-writes alongside its bulk files (`addReportFresh`/`addTranscript`/etc.), pulled here purely so a single changed record shows up as a single changed file in the diff.

Each prefix is listed via the Blob List API (there can be thousands of files) and downloaded with bounded concurrency — `ForEach-Object -Parallel`, `-ThrottleLimit` set by `$env:SNAPSHOT_HYDRATION_CONCURRENCY` (default `32`, mirroring the backend's own `SCENARIO_HYDRATION_CONCURRENCY`). `entrypoint.ps1` also does a one-time cleanup on every run (`git rm --ignore-unmatch`) of the old root-level flat files that earlier versions of this job committed before the scope was narrowed down — they were never going to be updated again and would otherwise just sit there as dead weight.

## Architecture

```
cron: 0 11 * * * (daily, 11:00 UTC = ~6:00 AM US Central/CDT — drifts to ~7:00 AM once CST kicks in for winter, since Container Apps cron is UTC-only with no DST awareness)
        │
        ▼
Container Apps Job "acj-<env>1-rwai-edusnap"   (Consumption, same AEN as the backend)
        │  User-Assigned Managed Identity
        ├─▶ Storage Blob Data Reader  → existing per-env storage account / azureBlobContainerName
        ├─▶ Key Vault Secrets User    → existing per-env KV (akv<env>1rwai), secret `snap-git-app-private-key`
        └─▶ GitHub App installation token → branch + PR + squash-merge on the private snapshot repo
```

The job reuses the backend's own existing shared infrastructure (Container Apps Environment, ACR, Key Vault, storage account) rather than provisioning new ones — see `infra/modules/containerAppJob-snapshot.bicep` and the `snapshot*` section of `infra/resources.bicep`.

**Prod only.** The bicep ships dormant everywhere by default (`deploySnapshotJob` gates on `snapshotRepo` being non-empty), and that's intentional — only prod's `SNAPSHOT_REPO` / `SNAPSHOT_GIT_APP_*` values should ever be set. Don't populate those for dev/qa; the module doesn't need any code change to enforce this, just don't provision it there.

No secret is baked into the image or set as a plain Job env var. The GitHub App's private key and (optionally) a Teams webhook URL are stored as Key Vault secrets and referenced via `secrets[].keyVaultUrl` on the Job — the **Container Apps platform itself** resolves them into env vars using the Job's managed identity, so `entrypoint.ps1` just reads `$env:GIT_APP_PRIVATE_KEY` / `$env:TEAMS_WEBHOOK_URL` directly rather than fetching them a second time.

## Landing via branch + PR + merge

Each run creates its own branch (`snapshot/<date>-<random>`), opens a PR against `main`, squash-merges it via the GitHub API, and deletes the branch — never a direct push. This makes each day's changes reviewable as a PR (e.g. [student-app-scenario-snapshot#2](https://github.com/Realityworks-AI/student-app-scenario-snapshot/pull/2)) instead of a silent commit. Requires the GitHub App to have the **Pull requests: Read and write** repository permission in addition to Contents — a one-time manual addition in the App's settings (GitHub doesn't expose permission edits via API), which the org must then re-approve on the installation.

A Claude-driven review step on each PR has been discussed but is deliberately deferred until there's been some real usage first.

## Notifications

Posts to the **08 - RW AI - Gate Information** Teams channel via an incoming webhook (`snapshotTeamsWebhookUrl`, stored as the KV secret `snap-teams-webhook-url`): tagged on failure (so it actually gets noticed), untagged on success (so it doesn't). Leaving it unset (the default) runs the job exactly as before, silently. Nothing is sent to the actual data consumer (Bernard) — this channel is for the team's own troubleshooting visibility.

Successful-run notifications may get noisy enough to want trimming later (e.g. only notify on a failure, or only on success-with-something-interesting) — deliberately not doing that yet, waiting to see if it actually becomes a problem in practice first.

Unlike the GitHub App key, the webhook secretRef is only wired into the Job on a deploy where `snapshotTeamsWebhookUrl` is actually passed — a later re-provision that omits it will un-wire notifications until it's passed again (fetch-and-pass-through the existing value first if you need it to persist across routine re-provisions, the same pattern `scripts/Provision-Bicep.ps1` already uses for the backend's custom domain binding).

## Deploying the job

> **Doing this for real, for the first time?** [`docs/SNAPSHOT-PROD-SETUP.md`](./SNAPSHOT-PROD-SETUP.md) is the full walkthrough. `scripts/New-SnapshotGitHubApp.ps1` creates the GitHub App itself (two browser clicks, no manual form-filling) and hands off to `scripts/Provision-Snapshot-Prod.ps1`, which scripts steps 3-4 below (setting the env vars + running `Provision-Bicep.ps1`) and auto-resolves the installation ID. The steps below are the reference summary.

The job module only deploys when `snapshotRepo` is non-empty (`infra/resources.bicep`'s `deploySnapshotJob`), so it ships dormant until the GitHub App side is ready. To turn it on for an environment:

1. Create the private snapshot repo (e.g. `Realityworks-AI/student-app-scenario-snapshot`).
2. Create a GitHub App scoped to only that repo with **both** `contents: write` and `pull_requests: write` (the job lands each run via branch + PR + squash-merge, not a direct push — see [Landing via branch + PR + merge](#landing-via-branch--pr--merge) above), install it on the repo, and note the App ID + installation ID.
3. Provision with these env vars set (same `provision` flow as `scripts/Provision-Bicep.ps1` uses for the backend's secrets):

   | Env var | Maps to | Notes |
   |---|---|---|
   | `SNAPSHOT_REPO` | `snapshotRepo` | `"owner/repo"`, e.g. `Realityworks-AI/student-app-scenario-snapshot` |
   | `SNAPSHOT_GIT_APP_ID` | `snapshotGitAppId` | not secret |
   | `SNAPSHOT_GIT_APP_INSTALLATION_ID` | `snapshotGitAppInstallationId` | not secret |
   | `SNAPSHOT_GIT_APP_PRIVATE_KEY` | `snapshotGitAppPrivateKey` | PEM key; empty preserves the existing KV value on re-provisions. **Must be set on the same deploy that first sets `SNAPSHOT_REPO`** — the Job references this secret unconditionally, so it needs to exist before the Job is created |
   | `SNAPSHOT_IMAGE_TAG` | `snapshotImageTag` | defaults to `placeholder` until `build-snapshot-image.yml` has pushed a real image |
   | `SNAPSHOT_TEAMS_WEBHOOK_URL` | `snapshotTeamsWebhookUrl` | optional; see [Notifications](#notifications) above |
   | `SNAPSHOT_TEAMS_MENTION` | `snapshotTeamsMention` | optional, only applied on **failure**; a UPN/email (e.g. `someone@rwthrive.com`), not secret |

4. Manually trigger the Job once (`az containerapp job start -n acj-prod1-rwai-edusnap -g ARG-prod1-rwai`, or run the **Trigger Snapshot Job (prod)** GitHub Actions workflow below) before waiting for the real daily run.

## Triggering a run manually

The job's daily cadence is native to Container Apps Jobs (the `cronExpression` on the scheduled trigger) — nothing needs to run for the normal daily snapshot to happen. For an ad hoc run (verifying a fix, or an extra snapshot around a data change), use `.github/workflows/trigger-snapshot-job.yml` (**Actions → Trigger Snapshot Job (prod)**, `workflow_dispatch`). It only ever targets prod, requires the same `prod` environment approval as a backend deploy, and just calls `az containerapp job start` — it never touches infra and is entirely separate from `deploy-backend.yml`.

## Building the image

`.github/workflows/build-snapshot-image.yml` builds and pushes `snapshot/Dockerfile` to the shared ACR (`acrall1rwai`) whenever `snapshot/**` changes on `dev`/`qa`/`main`. The job's own daily trigger is native to Container Apps Jobs — this pipeline exists only to publish a new image, not to run the snapshot itself.

## Runbook — "the snapshot didn't run / didn't push"

1. `az containerapp job execution list -n acj-<env>1-rwai-edusnap -g ARG-<env>1-rwai` — check status and exit code of the latest execution.
2. `az containerapp job logs show -n acj-<env>1-rwai-edusnap -g ARG-<env>1-rwai` — look for the failing step.
3. Common failure modes:
   - Managed Identity token fetch failed → role assignment not yet propagated (can take a few minutes after deploy).
   - Blob fetch 403 → `Storage Blob Data Reader` not granted, or the storage account's network rules changed.
   - GitHub App token exchange failed → App ID/installation ID wrong, or the private key in KV doesn't match the App.
   - Git push failed → GitHub App installation revoked, or a PR merge conflict/branch-protection rule blocking the squash-merge.
   - PR creation/merge failed with a 403 → the App's `Pull requests: Read and write` permission isn't active yet — either it was never added, or it was added to an already-installed App and the org hasn't approved the increase (see `SNAPSHOT-PROD-SETUP.md`'s note on this).
   - Teams notification never showed up → check the job's own logs first (a failed webhook post never fails the job itself, by design); if the webhook was posted but nothing appeared, the payload schema may not match what the channel's Workflow expects (see [Notifications](#notifications) above).
4. Fix, then re-run manually with `az containerapp job start` (or the **Trigger Snapshot Job (prod)** workflow); verify the commit shows up in the snapshot repo.

## Files

| Path | Purpose |
|---|---|
| `snapshot/Dockerfile` | `mcr.microsoft.com/powershell` + `git`, runs `entrypoint.ps1` |
| `snapshot/entrypoint.ps1` | Pulls individual scenario/report/transcript blobs, sorts keys recursively (stable diffs), lands via branch + PR + squash-merge |
| `infra/modules/containerAppJob-snapshot.bicep` | The Container Apps Job resource |
| `infra/modules/storageBlobDataReaderRoleAssignment.bicep` | Grants the job's UAI read access to the source blob container |
| `.github/workflows/build-snapshot-image.yml` | Builds/pushes the job's image on `snapshot/**` changes |
| `.github/workflows/trigger-snapshot-job.yml` | Manual, on-demand run of the prod job (`workflow_dispatch`) |
| `scripts/New-SnapshotGitHubApp.ps1` | Creates the GitHub App via the manifest flow, then hands off to Provision-Snapshot-Prod.ps1 |
| `scripts/Provision-Snapshot-Prod.ps1` | Scripts the one-time prod provisioning (env vars + `Provision-Bicep.ps1`) |
| `scripts/lib/GitHubAppJwt.ps1` | Shared App-JWT signing/installation-lookup helpers, dot-sourced by both scripts above |
| `docs/SNAPSHOT-PROD-SETUP.md` | Click-by-click first-time setup walkthrough |
