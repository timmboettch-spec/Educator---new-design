/** Outcome of one class × simulation pair in `POST /class-simulations/bulk`. */
export enum ClassSimulationAssignmentStatus {
  CREATED = 'CREATED',
  VALID = 'VALID',
  FAILED = 'FAILED',
}

/** Why a pair in `POST /class-simulations/bulk` was refused. */
export enum ClassSimulationAssignmentFailureReason {
  CLASS_NOT_ACCESSIBLE = 'CLASS_NOT_ACCESSIBLE',
  SIMULATION_NOT_FOUND = 'SIMULATION_NOT_FOUND',
  ALREADY_ASSIGNED_SAME_DATES = 'ALREADY_ASSIGNED_SAME_DATES',
  ALREADY_ASSIGNED_OVERLAP = 'ALREADY_ASSIGNED_OVERLAP',
}

/**
 * Class-simulation assignment constants. Not named `ClassSimulationConstants` — that name is
 * still taken by the legacy module-local `src/class-simulations/class-simulation.constant.ts`.
 */
export const ClassSimulationAssignmentConstants = {
  DATE: {
    /** MM-DD-YYYY or ISO (`YYYY-MM-DD`, optionally with a time part) — same as the legacy assign DTO. */
    INPUT_REGEX: /^(?:\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2}(?:T.*)?)$/,
    STORAGE_FORMAT: 'YYYY-MM-DD',
  },
  BULK: {
    ROUTE: 'bulk',
    /** One school's classes: ~1.5× the largest school seen (13). Bounds the per-class work. */
    MAX_CLASSES: 20,
    /** Above the most simulations any class has had (8). Max pairs = 20 × 10 = 200. */
    MAX_SIMULATIONS: 10,
    /** Classes whose not-yet-used AI student count runs at once. */
    SEAT_COUNT_CONCURRENCY: 5,
    /** Created rows whose post-commit reminders + Google CourseWork sync run at once. */
    SIDE_EFFECT_CONCURRENCY: 5,
  },
};

export const ClassSimulationDateConstants = {
  DATE_FORMAT:
    /^(?:\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?)$/,
  MM_DD_YYYY_FORMAT: /^(\d{2})-(\d{2})-(\d{4})$/,
};
