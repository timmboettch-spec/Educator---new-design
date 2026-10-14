import type { SimulationReport } from 'src/database/entities';
import type { AttemptRowInput } from './simulation-report.interface';

/** One graded Attempt to record. */
export interface RecordSubmittedAttemptInput {
  /** The Attempt row; `studentId` is the `students.id` uuid and `scenarioId` the Simulation's `id`. */
  attempt: AttemptRowInput;
}

export interface RecordSubmittedAttemptResult {
  /** The stored Attempt: the new one, or the existing one when the transcript was already recorded. */
  report: SimulationReport;
  /** False when the transcript already had an Attempt, so no count or stat changed. */
  recorded: boolean;
}
