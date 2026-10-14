# ADR-0009: Every Attempt Lives in `simulation_reports`; the Blob Store Is Retired

## Status

Proposed. Replaces ADR-0004 (DB authoritative, blob additive supplement), which is cited in
`CONTEXT.md` but has no file in this folder. Once this lands, ADR-0004's merge model no longer
exists.

## Context

Simulation reports live in two places. `simulation_reports` in Postgres held one **Report**
per `(student_id, scenario_id)`, enforced by `UQ_SIMULATION_REPORTS_STUDENT_SCENARIO`.
`reports.json` in Azure Blob Storage held every **Attempt**. Read paths merged the two at
request time (`dedupeBlobReports` in `simulation-reports.service.ts`), keyed on the
`id`/`transcriptId` inside `report_data`. Every count, unread badge and the completion graph
read Postgres only.

Since `SimulationReportsService.save()` lost its route, the only live writer of a full
report is `POST /students-backend/reports/create` (`createReportWithAI`), which writes
**only to the blob**. Postgres receives nothing but early-completion stubs. So every
Postgres-only count already undercounts recent completions, and only the list views,
through the blob merge, show them.

`reports.json` itself is unreliable. `addReportFresh` downloads the whole file, appends and
uploads it again, so simultaneous report generations overwrite each other and reports are
lost. Every report is also written once to its own blob, `reports/{id}.json`, and those
blobs can't overwrite each other because the id is unique. **Every report has one**, so the
per-report blobs are the complete record.

We want a single data store for reports: Postgres.

## Decision

**`simulation_reports` stores every Attempt, not one row per student+scenario.** The
`(student_id, scenario_id)` unique constraint is dropped. No new table is added and there is
**no discriminator column**. There is no separate "Report" row and
**no earliest-Attempt filter**: every Attempt is a first-class row, and listings, counts,
unread badges and the completion graph read all of them. Every consumer that assumed one row
per pair (counts, unread badges, the completion graph, listings, `syncStudentStats`,
`startAssessment`, the in-place update in `handleStudentReportCompletion`) is rewritten to work
over Attempts; where a figure is per student (e.g. "students who completed"), it uses
`COUNT(DISTINCT student_id)`.

**Every top-level field of a `reports.json` entry gets its own column, and `report_data`
still holds the verbatim entry.** Scalars are typed (`varchar`/`text`, `double precision`
for scores and durations, `integer` for counts, `timestamptz` for times). Nested objects
and arrays (`communicationAssessment`, `summaryByCategory`, `scoreJson`, the action lists,
…) each get **one jsonb column, never child tables**. The column set matches the current
report format exactly. Fields found only in older reports (`linearPhaseScores`,
`actionsTimeline`, `strengths`, `pdfUrl`, …) have no column and survive only in
`report_data`. Where a field name would
collide with an existing column, it is renamed: the blob's `id` → `report_id` (the PK stays
the uuid `id`), and the blob's `student_id`, which is a Student Code → `student_code`
(`student_id` stays the `students.id` uuid). Keeping `report_data` means fields that have no
column yet are not lost, and existing `report_data` readers and jsonb expression indexes keep
working. The cost is that the data is stored twice, so every write must fill both from the
same object. **`transcript_id`, unique**, is the Attempt's identity and the idempotency key
for backfill and writes (`ON CONFLICT DO NOTHING`; an existing DB row wins). `created_at` becomes `timestamptz` and, for backfilled rows, holds the Attempt's own
time (`createdAt` → `scenarioEndTime` → `scenarioStartTime`, UTC), not the insertion time.

**The backfill source is the per-report blobs (`reports/*.json`), one row per blob;
`reports.json` is ignored.** Duplicate `transcriptId`s can still exist across blobs, because
the duplicate check in `createReportWithAI` reads the lossy `reports.json`. The earliest
blob per `transcriptId` is kept.

**The cutover is split into a write phase and a read phase, shipped in the same release.**
The write phase makes `createReportWithAI` write only to Postgres: no `reports.json` append
and no `reports/{id}.json` blob. Before the LLM call it looks up the Attempt by
`transcript_id` and returns the existing one, so a retry is idempotent and free; the insert
still uses `ON CONFLICT DO NOTHING` for concurrent requests. The dead blob writers are deleted. The
early-completion stub path is left unchanged in the write phase; it stops assuming one row per
`(student_id, scenario_id)` in the read phase. The read
phase moves every blob reader to Postgres. The write phase must never be deployed alone: between
the phases, blob-backed screens (including a student's own report right after creation) would
not show new Attempts. If the read phase slips, the student's own report reads move to
Postgres together with the write phase. The backfill belongs to the read phase.

**Postgres is the only data store after cutover.** There is no dual-write phase: backfill,
deploy DB-only code, then backfill again after the rollout completes to pick up Attempts that
old replicas wrote to the blob. Rollback is **fix forward only**. The blob stays read-only as
an archive and is never written again.

## Considered Options

- **Separate Attempt table, with `simulation_reports` kept as the Report.** Preserves the
  existing meaning of the table and every existing query. Rejected because we chose to keep
  the table count unchanged.
- **Discriminator column (`is_report`) with a partial unique index.** Would let the database
  enforce one Report per pair, keep today's counts exactly, and avoid most consumer rewrites.
  Rejected: every Attempt is listed and counted, so no row needs to be marked as the Report.
- **`report_data` only, with no per-field columns.** Lossless and no duplication, but every
  field is reachable only through jsonb expressions. Rejected in favour of typed columns.
- **Per-field columns with `report_data` dropped.** No duplication, but all ~68 `report_data`
  readers and the jsonb expression indexes would have to be rewritten in the same change, and
  any field without a column would be lost. Rejected.
- **Normalising nested data into child tables.** Roughly 8–12 extra tables for phase scores,
  rubrics and actions, for data that is only ever read whole. Rejected.
- **Dual-write with read switching behind a flag.** Gives a rollback path but adds a temporary
  write path, a reconciler, and a phase where the two data stores can diverge. Rejected because
  the only writer is code in this repo, so a single cutover is enough.

## Consequences

- **This is a functional change, not just a storage move.** Blob-only student+scenario pairs
  become Reports, so `reports_count`, "sims completed", the completion graph and unread
  badges jump at cutover. Mostly this corrects the existing undercount, and it needs a
  release note. `time_spent` (summed across rows by `syncStudentStats`) also changes.
- **Plain `COUNT(*)` on `simulation_reports` counts Attempts**, and that is the intended
  meaning. Use `COUNT(DISTINCT student_id)` when a figure is per student.
- **Data the backfill can't place is quarantined, not migrated:** entries with no
  `transcriptId`, duplicate `transcriptId`s (the earliest is kept), Student Codes that are
  unresolved or ambiguous (no code history exists, so regenerated or revoked codes can't be
  recovered automatically), unparsable timestamps, and `\u0000` in payloads.
- **`report_data` shape drift is controlled at the write boundary.** `createReportWithAI`
  builds the row through a typed function instead of `as unknown as Report`, and a test pins
  the jsonb paths that the expression indexes and listings read.
- **Dead blob writers must be deleted before cutover** (`save()`, `remapReportsUserId`,
  `generate`, `generateMockAssessment`, `createReport`, `writeReports`) so none of them can
  bring back a blob-only write path.

## Amendment: read phase (2026-10-07)

**Status: read cutover complete.** Every blob report reader, the report cache and the old
`report_data` score and sort expressions are deleted; nothing in the app reads `reports.json`
or `reports/{id}.json`.

The read phase is specified in `docs-local/read-reports-from-database/spec.md`. It changes three
points above:

- **`report_data` is no longer read as the report.** It is still filled verbatim on every
  write. After the read phase, the only code that reads it is early-completion handling,
  which is deliberately left unchanged. Every other read that used `report_data` reads
  the whole `simulation_reports` row (its per-field columns) instead.
  The debug endpoint that listed `report_data` keys now lists the row's populated columns.
  The values that read logic took from `report_data` map as follows:
  - `transcriptId` → `transcript_id`
  - `overallScore` → `score`, falling back to `score_json.overallScore`
  - the performance label → `score_json.overallLabel`, falling back to `performance_label`

  This replaces the earlier reason for keeping `report_data`, which was "existing
  `report_data` readers keep working". The column is now kept so that no field is lost and
  so that early-completion handling keeps working.
- **The backfill is a separate ticket that gates the release; it is not part of the read
  phase.** A read-only verification script compares the per-report blobs with
  `simulation_reports` in each environment. It also flags rows whose typed columns are null
  while `report_data` has the value. The release ships only
  when the script reports zero gaps.
- **The app never reads the Blob store.** Every blob reader is deleted, including the report
  cache. The Blob store is a cold archive, used only as the source for the backfill.

**Consequence:** fields that exist only in older reports and have no column
(`linearPhaseScores`, `actionsTimeline`, `strengths`, `pdfUrl`, …) are no longer shown
anywhere in the app. If a screen needs one of them, give it a column first; don't go back to
reading `report_data`.
