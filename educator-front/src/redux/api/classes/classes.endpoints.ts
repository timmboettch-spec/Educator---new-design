export const GET_ACTIVITY_OVERVIEW = '/api/classes/user/activity-overview';
export const GET_ATTENTION_SUMMARY = '/api/classes/user/attention-summary';
export const GET_SIMULATIONS_COMPLETED_GRAPH =
  '/api/classes/user/simulations-completed-graph';
export const GET_SCHOOL_GROUPS = '/api/classes/schools';
export const GET_CLASSES = '/api/classes';
export const CREATE_CLASS = '/api/classes';
export const classById = (id: string) => `/api/classes/${id}`;
export const exportStudentCodesByClassId = (id: string) =>
  `/api/classes/${id}/export-student-codes`;
