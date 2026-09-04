import { LmsType } from 'src/common/enums/lms.enum';

export interface LtiDefaultEndpoints {
  authEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  lmsBaseUrl?: string;
  /** @deprecated Use lmsBaseUrl */
  moodleUrl?: string;
}

/** Default OIDC endpoints per LMS type (issuer base URL, no trailing slash). */
export function resolveDefaultLtiEndpoints(lmsType: LmsType, issuer: string): LtiDefaultEndpoints {
  const base = issuer.trim().replace(/\/+$/, '');

  switch (lmsType) {
    case LmsType.CANVAS:
      return {
        authEndpoint: `${base}/api/lti/authorize_redirect`,
        tokenEndpoint: `${base}/login/oauth2/token`,
        jwksUrl: `${base}/api/lti/security/jwks`,
      };
    case LmsType.BLACKBOARD:
      return {
        authEndpoint: `${base}/learn/api/public/v1/oauth2/authorizationcode`,
        tokenEndpoint: `${base}/learn/api/public/v1/oauth2/token`,
        jwksUrl: `${base}/learn/api/public/v1/oauth2/jwks`,
      };
    case LmsType.MOODLE:
    default:
      return {
        authEndpoint: `${base}/mod/lti/auth.php`,
        tokenEndpoint: `${base}/mod/lti/token.php`,
        jwksUrl: `${base}/mod/lti/certs.php`,
        lmsBaseUrl: base,
        moodleUrl: base, // Legacy alias
      };
  }
}

export function parseLmsType(raw: string | undefined): LmsType {
  const normalized = String(raw ?? LmsType.MOODLE)
    .trim()
    .toLowerCase();
  if (normalized === 'canvas') return LmsType.CANVAS;
  if (normalized === 'blackboard') return LmsType.BLACKBOARD;
  return LmsType.MOODLE;
}
