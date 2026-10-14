import { LmsType } from 'src/common/enums/lms.enum';

export interface LtiDefaultEndpoints {
  authEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  lmsBaseUrl?: string;
  /** @deprecated Use lmsBaseUrl */
  moodleUrl?: string;
}

export const CANVAS_ISSUER_VALIDATION_MESSAGE =
  'Invalid Canvas Issuer URL. For Canvas Cloud use https://canvas.instructure.com (or beta/test). For self-hosted Canvas, Issuer URL must match the Canvas base URL.';

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(normalizeBase(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosted Canvas Cloud / beta / test → shared SSO OIDC host. */
export function resolveHostedCanvasOidcBase(issuerOrBaseUrl: string): string | null {
  const host = hostnameOf(issuerOrBaseUrl);
  if (host === 'canvas.instructure.com') {
    return 'https://sso.canvaslms.com';
  }
  if (host === 'canvas.beta.instructure.com') {
    return 'https://sso.beta.canvaslms.com';
  }
  if (host === 'canvas.test.instructure.com') {
    return 'https://sso.test.canvaslms.com';
  }
  return null;
}

/**
 * Reject Canvas issuer typos (e.g. canvass.instructure.com).
 * Valid: known hosted issuer, or issuer host === Canvas base URL host (self-hosted).
 */
export function assertValidCanvasIssuer(issuer: string, lmsBaseUrl: string): void {
  const normalizedIssuer = normalizeBase(issuer);
  const normalizedBase = normalizeBase(lmsBaseUrl);

  if (!normalizedIssuer) {
    throw new Error('Canvas Issuer URL is required');
  }
  if (!normalizedBase) {
    throw new Error('Canvas base URL is required');
  }

  if (resolveHostedCanvasOidcBase(normalizedIssuer)) {
    return;
  }

  const issuerHost = hostnameOf(normalizedIssuer);
  const baseHost = hostnameOf(normalizedBase);
  if (issuerHost && baseHost && issuerHost === baseHost) {
    return;
  }

  throw new Error(CANVAS_ISSUER_VALIDATION_MESSAGE);
}

/** Default OIDC endpoints per LMS type (issuer base URL, no trailing slash). */
export function resolveDefaultLtiEndpoints(lmsType: LmsType, issuer: string): LtiDefaultEndpoints {
  const base = normalizeBase(issuer);

  switch (lmsType) {
    case LmsType.CANVAS: {
      const oidcBase = resolveHostedCanvasOidcBase(base) || base;
      return {
        authEndpoint: `${oidcBase}/api/lti/authorize_redirect`,
        tokenEndpoint: `${oidcBase}/login/oauth2/token`,
        jwksUrl: `${oidcBase}/api/lti/security/jwks`,
      };
    }
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
  if (normalized === 'google_classroom' || normalized === 'google-classroom') {
    return LmsType.GOOGLE_CLASSROOM;
  }
  return LmsType.MOODLE;
}
