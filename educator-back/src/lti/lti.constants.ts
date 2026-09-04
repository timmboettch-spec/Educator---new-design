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
    DEBUG_LAUNCH: 'debug-launch',
    SESSION_EXCHANGE: 'session/exchange',
  },
} as const;
