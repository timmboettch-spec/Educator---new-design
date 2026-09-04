/**
 * Centralised route constants.
 * If a controller path changes, update here — specs stay untouched.
 *
 */
export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    ME: '/auth/me',
    LOGOUT: '/auth/logout',
  },

  ADMIN: {
    STUDENTS: '/admin/students',
    STUDENT: (key: string) => `/admin/students/${key}`,
    PERMISSIONS: '/admin/permissions',

    UNITS: '/admin/units',
    UNIT: (id: string) => `/admin/units/${id}`,
    UNIT_ASSIGN: (id: string) => `/admin/units/${id}/assign`,

    SCENARIOS: '/admin/scenarios',
    SCENARIO: (id: string) => `/admin/scenarios/${id}`,
    SCENARIO_ACTIONS: (scenarioId: string) => `/admin/scenarios/${scenarioId}/actions`,
    SCENARIO_ACTION: (scenarioId: string, index: number) =>
      `/admin/scenarios/${scenarioId}/actions/${index}`,
  },

  CLASSES: {
    ROOT: '/classes',
    BY_ID: (id: string) => `/classes/${id}`,
  },

  UNITS: {
    ROOT: '/units',
    BY_ID: (id: string) => `/units/${id}`,
  },

  SCENARIOS: {
    ROOT: '/scenarios',
    DEFAULT: '/scenarios/default',
    DEFAULT_BY_ID: (id: string) => `/scenarios/default/${id}`,
    BY_UNIT: (unitId: string) => `/scenarios/unit/${unitId}`,
    BY_ID: (id: string) => `/scenarios/${id}`,
  },

  REPORTS: {
    ROOT: '/reports',
    GENERATE: '/reports/generate',
    CREATE: '/reports/create',
    BY_ID: (id: string) => `/reports/${id}`,
    BY_TRANSCRIPT: (transcriptId: string) => `/reports/transcript/${transcriptId}`,
    EMAIL: (id: string) => `/reports/${id}/email`,
  },

  LOGS: {
    ROOT: '/logs',
    BY_ID: (id: string) => `/logs/${id}`,
    BY_SCENARIO: (scenarioId: string) => `/logs/scenario/${scenarioId}`,
    END: (id: string) => `/logs/${id}/end`,
    MESSAGES: (id: string) => `/logs/${id}/messages`,
  },

  UPLOADS: {
    IMAGE: '/uploads/image',
    DELETE: '/uploads/delete',
  },
} as const;
