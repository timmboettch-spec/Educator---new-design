/** RE-192: filter/sort options for `GET /simulation-reports`. */
export enum ReportReviewStatus {
  UNREAD = 'unread',
  READ = 'read',
}

export enum ReportListSortField {
  STUDENT_CODE = 'studentCode',
  STUDENT_NAME = 'studentName',
  MODE = 'mode',
  SIMULATION_NAME = 'simulationName',
  SCORE = 'score',
  TIME_SPENT = 'timeSpent',
  COMPLETED_AT = 'completedAt',
}

export const SimulationReportListingConstants = {
  DEFAULT_SORT: {
    FIELD: ReportListSortField.COMPLETED_AT,
    DIRECTION: 'DESC' as const,
  },
};
