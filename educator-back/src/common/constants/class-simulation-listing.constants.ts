/** Sort options for `GET /class-simulations?classId=` — one per returned field. */
export enum ClassSimulationSortField {
  SIM_ID = 'simId',
  SIM_NAME = 'simName',
  IS_ARCHIVED = 'isArchived',
  START_DATE = 'startDate',
  DUE_DATE = 'dueDate',
  CLOSE_DATE = 'closeDate',
  STARTED_COUNT = 'startedCount',
  COMPLETED_COUNT = 'completedCount',
  AVERAGE_SCORE = 'averageScore',
  AVATAR_ENABLED = 'avatarEnabled',
  UNIT_ID = 'unitId',
  UNIT_NAME = 'unitName',
}

export const ClassSimulationListingConstants = {
  DEFAULT_SORT: {
    FIELD: ClassSimulationSortField.SIM_NAME,
    DIRECTION: 'ASC' as const,
  },
  SORT_DIRECTIONS: ['asc', 'desc'] as const,
  /** `simulations_v2.status` values shown as archived — same rule as `ClassSimulationService.mapSimulation`. */
  ARCHIVED_SIMULATION_STATUSES: ['archived', 'draft'],
};
