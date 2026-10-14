export const LtiConstants = {
  SWAGGER: { TAG: 'LTI Tool Registration' },
  ROUTES: {
    BASE: 'lti',
    JWKS: 'jwks',
    STUDENTJWKS: 'studentjwks',
    METADATA: 'metadata',
    STUDENTMETADATA: 'studentmetadata',
    LOGIN: 'login',
    STUDENTLOGIN: 'studentlogin',
    CALLBACK: 'callback',
    STUDENTCALLBACK: 'studentcallback',
    LAUNCH: 'launch',
    STUDENTLAUNCH: 'studentlaunch',
    SESSION_EXCHANGE: 'session/exchange',
    DEEP_LINKING_EXCHANGE: 'deep-linking/exchange',
    DEEP_LINKING_SUBMIT: 'deep-linking/submit',
    DEEP_LINKING_PICKER: 'deep-linking/picker',
    DEEP_LINKING_SIMULATIONS: 'deep-linking/simulations',
  },
  REDIS: {
    STATE_KEY_PREFIX: 'lti:state:',
    STATE_TTL_SECONDS: 10 * 60,
    SESSION_KEY_PREFIX: 'lti:session:',
    /** One-time portal handoff codes (Canvas SpeedGrader may sit open before click). */
    SESSION_TTL_SECONDS: 30 * 60,
  },
  MESSAGE_TYPES: {
    RESOURCE_LINK_REQUEST: 'LtiResourceLinkRequest',
    DEEP_LINKING_REQUEST: 'LtiDeepLinkingRequest',
    DEEP_LINKING_RESPONSE: 'LtiDeepLinkingResponse',
    SUBMISSION_REVIEW_REQUEST: 'LtiSubmissionReviewRequest',
  },
  /** Deep Linking picker empty-state reasons returned by /deep-linking/simulations */
  DEEP_LINKING_PICKER_STATUS: {
    READY: 'ready',
    COURSE_NOT_LINKED: 'course_not_linked',
    NO_SIMULATIONS_ASSIGNED: 'no_simulations_assigned',
  },
} as const;

export type DeepLinkingPickerStatus =
  (typeof LtiConstants.DEEP_LINKING_PICKER_STATUS)[keyof typeof LtiConstants.DEEP_LINKING_PICKER_STATUS];
