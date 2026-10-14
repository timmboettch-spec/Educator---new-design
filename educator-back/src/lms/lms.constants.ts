export const LmsConstants = {
  SWAGGER: { TAG: 'LMS Integration' },
  ROUTES: {
    BASE: 'lms',
    CONFIGURE: 'schools/configure',
    SCHOOL_CONFIG: 'schools/:schoolId/config',
    EDUCATOR_CONFIG: 'educator/config',
    EDUCATOR_CONFIGURE: 'educator/configure',
    TEST_CONFIG: 'test-config',
    ROSTER_PREVIEW: 'roster/preview',
    STUDENT_PROFILE: 'students/:studentCode/profile',
    MOODLE_STUDENTS: 'moodle/students',
    MOODLE_COURSES: 'moodle/courses',
    MOODLE_MAPPED_CLASSES: 'moodle/mapped-classes',
    PROVISION_SYNC: 'provision/sync',
    GRADES_SYNC: 'grades/sync',
  },
  /** Plain-language toasts for standard OAuth 2.0 token-endpoint error codes. */
  OAUTH_ERRORS: {
    invalid_client:
      "The LMS didn't accept this Client ID. Copy the Client ID from the LMS tool registration, and check the tool's public keyset URL is this portal's JWKS URL.",
    unauthorized_client:
      'This Client ID is not allowed to connect. Check the tool is enabled in the LMS.',
    invalid_grant:
      "The LMS rejected this portal's signed request. Check the tool's public keyset URL is this portal's JWKS URL.",
    invalid_scope:
      'The LMS tool does not allow roster or grade access. Enable the Names and Roles and the Assignment and Grade services on the tool.',
  } as Record<string, string>,
  MESSAGES: {
    CONFIG_SAVED: 'LMS configuration saved successfully',
    CONFIG_NOT_FOUND: 'LMS configuration not found for this school',
    CONFIG_SAVE_UNVERIFIED:
      'LMS settings were not saved because the connection could not be verified.',
    CONFIG_TEST_OAUTH_REQUIRED:
      'LMS OAuth check did not run or failed. Verify Client ID and that the tool is registered with this portal’s JWKS.',
    CONFIG_TEST_SUCCESS: 'LMS connection successful',
    CONFIG_TEST_SUCCESS_CANVAS_DEPLOYMENT_AT_LAUNCH:
      'LTI connection verified (Client ID and URLs). Deployment ID will be confirmed on the first instructor launch from Canvas. Add a Canvas API token on Save to verify Deployment ID immediately.',
    CONFIG_TEST_FAILED: 'LMS connection failed',
    CONFIG_TEST_INCOMPLETE: 'Not enough LMS details to test. Provide the Issuer URL and Client ID.',
    CONFIG_TEST_KEYS_PENDING:
      'Save the LMS settings to verify the connection — this portal creates its signing keys on first save.',
    CONFIG_TEST_CANVAS_BASE_REQUIRED: 'Canvas base URL is required to test the connection.',
    CONFIG_TEST_CANVAS_BASE_UNREACHABLE:
      'Canvas base URL is unreachable. Check the Canvas base URL.',
    CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH:
      'Deployment ID was not found for this Client ID on Canvas (account or course apps). Copy Deployment ID from Admin → Apps → the installed LTI tool (not only the Developer Key page), and ensure the tool is installed on this Canvas site.',
    CONFIG_TEST_API_TOKEN_INVALID:
      'LMS API token check failed. Verify the Canvas API token or Moodle web service token.',
    CONFIG_TEST_MOODLE_BASE_REQUIRED:
      'Moodle site URL (Issuer URL) is required to test the connection.',
    CANVAS_ISSUER_INVALID:
      'Invalid Canvas Issuer URL. For Canvas Cloud use https://canvas.instructure.com (or beta/test). For self-hosted Canvas, Issuer URL must match the Canvas base URL.',
    ROSTER_PREVIEW: 'Roster preview (in memory only)',
    PROFILE_LOOKUP: 'Student profile retrieved from LMS',
    FORBIDDEN: 'You do not have permission to perform this action',
    LIVE_CLASS_SCHOOL_MISSING:
      'No mapped school found for this class. Connect the class to its LMS course before syncing its roster.',
  },
} as const;

export const NRPS_ACCEPT = 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';

export const NRPS_MAX_PAGES = 50;

export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

export const LEGACY_NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lis/v2/membership#read';

/** LTI 1.3 AGS scopes — same URLs for Moodle, Canvas (IMS spec). */
export const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const AGS_LINEITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
export const AGS_LINEITEM_READONLY_SCOPE =
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly';

/** OAuth token purpose — drives which LTI Advantage scope(s) to request. */
export enum LmsOAuthPurpose {
  NRPS = 'nrps',
  AGS_SCORE = 'ags-score',
  AGS_LINEITEM = 'ags-lineitem',
}

/** Scope fallbacks per purpose (platform-agnostic; adapters only differ on API calls). */
export const LMS_OAUTH_SCOPES: Record<LmsOAuthPurpose, readonly string[]> = {
  [LmsOAuthPurpose.NRPS]: [NRPS_SCOPE, LEGACY_NRPS_SCOPE],
  [LmsOAuthPurpose.AGS_SCORE]: [AGS_SCORE_SCOPE],
  [LmsOAuthPurpose.AGS_LINEITEM]: [AGS_LINEITEM_SCOPE, AGS_LINEITEM_READONLY_SCOPE],
};
