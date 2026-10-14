# ADR-0010: Simulation Progress Owns Attempt Limits and Forfeit; `simulation_reports` Stays the Attempt Log

## Status

Proposed. Amends [ADR-0009](0009-attempts-in-simulation-reports-blob-retired.md).

## Decision

A new `student_simulation_progress` row per `(student_id, simulation_id)` is the source of truth for
a student's Practice/Assessment Attempt counts, whether the Simulation is Completed, and Forfeit
(`forfeited_at`). `simulation_reports` remains the only Attempt log, as ADR-0009 decided. It gains an
`attempt_number`, made unique per `(student_id, scenario_id, mode)` and checked against Max Attempts
for Assessment. Report creation locks the progress row and writes the report, the progress row and the
`students` stats in one transaction. The database constraints, not the service check, are what
guarantee the limit. The Forfeit flag in `report_data` is retired as a write target.

## Amendment: `report_data` retired

The `report_data` fallback is gone. Application code no longer reads, writes or indexes
`simulation_reports.report_data`; Completed and Forfeit state come only from
`student_simulation_progress`. The column and its existing data are **retained but unused** (new rows
get `'{}'` from a database default). It must not be dropped without a new ADR. Legacy Completed and Forfeited Simulations are
populated into `student_simulation_progress` by the separate backfill ticket for Completed and Forfeited Simulations (release dependency of the
[retire-report-data spec](../retire-report-data/spec.md)), which must have run in an environment
before this change is released there.

## Considered Options

- **A separate `student_simulation_attempts` table**, as in the original design. Rejected because it
  would be a second record of the same Attempt that ADR-0009 already puts in `simulation_reports`,
  so the two could drift.
- **Counting `simulation_reports` on every check, without a progress row.** Rejected because there
  is no single row to lock, so concurrent submissions can both pass the limit, and there is no
  place for Completed or Forfeit state.
- **Limits keyed on `class_simulation_id`.** Rejected because a Class Transfer or re-assignment
  must not reset Max Attempts.
