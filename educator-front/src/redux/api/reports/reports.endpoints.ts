export const GET_REPORTS_LIST = '/api/simulation-reports/list';
export const BULK_REVIEW_REPORTS = '/api/simulation-reports/bulk-review';
export const reportViewed = (id: string) =>
  `/api/simulation-reports/${id}/viewed`;
