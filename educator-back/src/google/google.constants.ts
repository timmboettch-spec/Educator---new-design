export enum GoogleConnectionStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  ERROR = 'error',
}

/**
 * DevOps handoff Classroom OAuth scopes (Internal consent screen — no Google verification).
 * `openid` + `email` are required so the connect callback can resolve the signed-in
 * Google account via the OIDC userinfo endpoint (shown as "Connected as …" in the UI).
 * `classroom.profile.emails` only covers Classroom roster profile emails, not the OAuth identity.
 */
export const GOOGLE_CLASSROOM_DEFAULT_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.coursework.me',
  'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
] as const;

export const GoogleConstants = {
  SWAGGER: { TAG: 'Google Classroom' },
  ROUTES: {
    BASE: 'google',
    CONNECT: 'schools/:schoolId/connect',
    CONNECTION: 'schools/:schoolId/connection',
    COURSES: 'schools/:schoolId/courses',
    PROVISION_COURSES: 'schools/:schoolId/courses/provision',
    ARCHIVED_CLASSES: 'schools/:schoolId/archived-google-classes',
    COURSE_MAPPINGS: 'schools/:schoolId/course-mappings',
    COURSE_MAPPINGS_BULK_LINK: 'schools/:schoolId/course-mappings/bulk-link',
    COURSE_MAPPING_BY_ID: 'schools/:schoolId/course-mappings/:mappingId',
    SYNC_ROSTER: 'schools/:schoolId/course-mappings/:mappingId/sync-roster',
    SYNC_ROSTERS: 'schools/:schoolId/sync-rosters',
    OAUTH_BASE: 'auth/google',
    CALLBACK: 'callback',
    /** Public browser redirect: start student Classroom OAuth (openid/email). */
    STUDENT_START: 'student/start',
    /**
     * Public Classroom assignment entry (posted as CourseWork material).
     * Teachers are handed to the educator portal; students to HS Online.
     */
    CLASSROOM_LAUNCH: 'classroom/launch',
  },
  STUDENT_OAUTH: {
    SCOPES: ['openid', 'email'] as const,
    ACCESS_TYPE: 'online',
    PROMPT: 'select_account',
  },
  REDIS: {
    STATE_KEY_PREFIX: 'google:oauth:state:',
    STATE_TTL_SECONDS: 600,
  },
  OAUTH: {
    ACCESS_TYPE: 'offline',
    PROMPT: 'consent',
    RESPONSE_TYPE: 'code',
    EXPIRY_SKEW_MS: 60_000,
    TOKEN_RETRY_ATTEMPTS: 3,
    TOKEN_RETRY_BASE_DELAY_MS: 250,
  },
  MESSAGES: {
    CONNECT_INITIATED: 'Google Classroom connect initiated',
    CONNECTION_STATUS: 'Google Classroom connection status for this educator',
    CONNECTION_NOT_FOUND: 'Google Classroom is not connected for this educator',
    CONNECTION_DISCONNECTED: 'Google Classroom disconnected for this educator',
    UNLINK_OWNER_ONLY: 'Only the class owner can unlink this Google Classroom course',
    LINK_OWNER_ONLY: 'Only the Google Classroom course owner can link this course',
    COURSES_LISTED: 'Google Classroom courses',
    COURSES_LIST_FAILED: 'Failed to list Google Classroom courses',
    COURSES_PROVISIONED: 'Google Classroom courses provisioned',
    COURSES_PROVISION_FAILED: 'Failed to provision Google Classroom courses',
    ARCHIVED_CLASSES_LISTED: 'Archived Google Classroom classes',
    COURSE_LINKED: 'Google Classroom course linked to class',
    COURSES_BULK_LINKED: 'Google Classroom courses linked',
    COURSE_UNLINKED: 'Google Classroom course unlinked',
    COURSE_LINK_FAILED: 'Failed to link Google Classroom course',
    COURSE_ALREADY_LINKED: 'This Google Classroom course is already linked to another class',
    CLASS_ALREADY_LINKED: 'This class is already linked to another Google Classroom course',
    CLASS_NOT_FOUND: 'Class not found for this school',
    MAPPING_NOT_FOUND: 'Google Classroom course mapping not found',
    MAPPINGS_LISTED: 'Google Classroom course mappings',
    ROSTER_SYNCED: 'Google Classroom roster synced',
    ROSTERS_SYNCED: 'Google Classroom rosters synced',
    COURSEWORK_CREATE_FAILED: 'Failed to create Google Classroom assignment',
    COURSEWORK_DELETE_FAILED: 'Failed to delete Google Classroom assignment',
    GRADE_PASSBACK_FAILED: 'Failed to submit grade to Google Classroom',
    GRADE_SUBMISSION_NOT_FOUND: 'No Google Classroom student submission found for this student',
    ROSTER_LIST_FAILED: 'Failed to list Google Classroom students',
    ROSTER_STUDENT_CREATE_FAILED: 'Failed to create student from Google Classroom roster',
    STUDENT_LOGIN_SUCCESS: 'Google Classroom student login successful',
    STUDENT_LOGIN_FAILED: 'Google Classroom student login failed',
    STUDENT_NOT_IN_ROSTER:
      'No synced Google Classroom student was found for this Google account. Ask your educator to sync the roster, then try again.',
    STUDENT_MULTIPLE_CLASSES:
      'This Google account is linked to more than one class. Open the assignment from Google Classroom again, or enter your student code.',
    STUDENT_OAUTH_START_FAILED: 'Unable to start Google Classroom student sign-in',
    STUDENT_OAUTH_PROFILE_FAILED:
      'Could not resolve your Google account. Close this tab and open the assignment from Classroom again.',
    FEATURE_DISABLED: 'Google Classroom is not enabled for this school',
    SCOPES_INCOMPLETE:
      'Google Classroom needs all requested permissions. Reconnect and allow every permission listed on the Google consent screen.',
    REAUTH_REQUIRED:
      'Google Classroom authorization expired or was revoked. Reconnect Google Classroom for this school.',
    FORBIDDEN: 'You do not have permission to perform this action',
    OAUTH_NOT_CONFIGURED: 'Google Classroom OAuth is not configured',
    GOOGLE_EMAIL_MISMATCH:
      'Google account email must match your RealityWorks educator login email',
    GOOGLE_ACCOUNT_ID_REQUIRED:
      'Google account identity could not be resolved; reconnect Google Classroom',
  },
} as const;
