/** Lifecycle of a student's progress on one Simulation; stored on `student_simulation_progress.status`. */
export enum SimulationProgressStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FORFEITED = 'forfeited',
}

export const SimulationAttemptConstants = {
  /**
   * Max Assessment Attempts per student per Simulation. The database CHECKs on
   * `student_simulation_progress` and `simulation_reports` hard-code the same value; changing it
   * needs a new migration that recreates them (see ADR-0010).
   */
  // SALES3 (2026-10-15): effectively unlimited, owner decision; CHECKs raised by RaiseAssessmentAttemptLimit1792100696555.
  MAX_ASSESSMENT_ATTEMPTS: 9999,
  /** Time budget behind the `students.time_remaining` stat: 400 hours. */
  TOTAL_ALLOCATED_SECONDS: 400 * 3600,
};
