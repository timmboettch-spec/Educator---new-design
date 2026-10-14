export const ROUTE_PATHS = {
  auth: {
    login: '/login',
    signup: '/signup',
    inviteSignup: '/signup/:invite_id',
    forgotPassword: '/forgotpassword',
    otpVerify: '/otpverify',
    resetPassword: '/resetpassword',
    redeem: '/redeem',
    /**
     * Terminal screen for an account that authenticates but holds no role this
     * portal serves. Deliberately not a guest-only route: sending such a user to
     * `/login` would bounce them straight back out again, since they *are*
     * authenticated.
     */
    noAccess: '/no-access',
  },
  lti: {
    deepLinking: '/lti/deep-linking',
  },
  dashboard: {
    root: '/',
    admin: '/admin-dashboard',
    educator: '/educator-dashboard',
  },
  schoolsEducators: {
    schools: '/schools',
    classes: '/classes',
    educators: '/educators',
  },
  simulation: {
    library: '/simulationlibrary',
    catalog: '/simulation-catalog',
    details: '/simulationdetails/:simulationId',
  },
  accountLms: {
    account: '/account',
    lmsIntegration: '/lms-integration',
    googleClassroom: '/google-classroom',
  },
  reports: {
    reportDetail: '/report-detail',
    transcript: '/transcript/:attemptId',
  },
  supportLegal: {
    customerSupport: '/customersupport',
    privacyPolicy: '/privacypolicy',
    terms: '/terms',
  },
} as const;

/** Search param on the Classes page that filters the table to one attention bucket. */
export const ATTENTION_MEASURE_PARAM = 'measure';

/**
 * Search params for a class's Reports sub-table: which class it's open for, the review
 * filter and sort. A shared or reloaded URL re-opens that table in the same state.
 */
export const REPORTS_TABLE_PARAMS = {
  classId: 'reportsClass',
  status: 'reportStatus',
  sort: 'reportSort',
  dir: 'reportDir',
} as const;

/** Classes page URL pre-filtered to one attention bucket, e.g. `/classes?measure=unreadReports`. */
export const buildClassesAttentionPath = (measure: string) =>
  `${ROUTE_PATHS.schoolsEducators.classes}?${new URLSearchParams({
    [ATTENTION_MEASURE_PARAM]: measure,
  }).toString()}`;
