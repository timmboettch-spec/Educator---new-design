export const ENDPOINTS = {
  AUTH: {
    SIGNUP: '/auth/signup',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REDEEM: '/auth/redeem',
    FORGOT_PASSWORD: '/auth/forgot-password',
    VERIFY_OTP: '/auth/verify-otp',
    RESET_PASSWORD: '/auth/reset-password',
    RESEND_OTP: '/auth/resend-otp',
    CSRF_TOKEN: '/auth/csrf-token',
    SELECT_ROLE: '/auth/select-role',
  },
  SCHOOLS: {
    BASE: '/schools',
    BY_USER: '/schools/user',
    BY_ID: (id: string) => `/schools/${id}`,
    BY_ADMIN: (adminId: string) => `/schools/admin/${adminId}`,
  },
  DASHBOARD: {
    OVERVIEW: '/dashboard/overview',
  },
  CLASSES: {
    BASE: '/classes',
    BY_ID: (id: string) => `/classes/${id}`,
  },
  STUDENTS: {
    BASE: '/students',
    BULK: '/students/bulk',
    BULK_UPLOAD: '/students/bulk-upload',
    BY_CLASS: (classId: string) => `/students/class/${classId}`,
    BY_USER: '/students/user',
    BATCH_EMAIL: '/students/batch-email',
    UPDATE_CODE: '/students/update-code',
    EMAIL_REPORT: '/students/email-report',
    BY_ID: (id: string) => `/students/${id}`,
    REVOKE_CODE: (id: string) => `/students/revoke-code/${id}`,
    REGENERATE_CODE: (id: string) => `/students/regenerate-code/${id}`,
    LOGIN: '/students/login',
    LOOKUP_BY_CODE: (code: string) => `/students/lookup/${code}`,
    START_ASSESSMENT: (id: string) => `/students/${id}/start-assessment`,
  },
  EDUCATORS: {
    ADMIN: '/educators/admin',
    BY_ID: (id: string) => `/educators/${id}`,
  },
  INVITES: {
    CREATE: '/invites/create',
    BY_ID: (id: string) => `/invites/${id}`,
  },
  SIMULATION_CATALOG: {
    SCENARIOS: '/simulations/educators',
  },
  SIMULATIONS: {
    LIST: '/simulations',
    PUBLIC: (scenarioId: string) => `/simulations/${scenarioId}/public`,
    BY_UNIT: (unitId: string) => `/simulations/by-unit/${unitId}`,
  },
  EDUCATOR_SIMULATIONS: {
    LIBRARY: '/educator-simulations/my-library',
    ADD_TO_LIBRARY: '/educator-simulations/add-to-library',
  },
  LOGS: {
    BASE: '/logs',
  },
  REPORTS: {
    STUDENT: '/student-reports',
    SIMULATION: '/simulation-reports',
  },
  UPLOADS: {
    BASE: '/uploads',
    PROFILE_IMAGE: '/uploads/profile-image',
  },
  HEALTH: '/healthz',
} as const;
