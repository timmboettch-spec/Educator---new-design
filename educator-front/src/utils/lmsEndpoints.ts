/** Normalize LMS base/issuer URLs (trim + strip trailing slashes). */
export function normalizeLmsBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(normalizeLmsBaseUrl(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const CANVAS_ISSUER_VALIDATION_MESSAGE =
  'Invalid Canvas Issuer URL. For Canvas Cloud use https://canvas.instructure.com (or beta/test). For self-hosted Canvas, Issuer URL must match the Canvas base URL.';

/**
 * Hosted Canvas (Instructure Cloud) uses institution URL for API/NRPS (lmsBaseUrl)
 * but shared SSO hosts for OIDC auth/token/JWKS. See CANVAS-LTI-SETUP-CHECKLIST §3.
 */
export function resolveHostedCanvasOidcBase(
  issuerOrBaseUrl: string
): string | null {
  const normalized = normalizeLmsBaseUrl(issuerOrBaseUrl).toLowerCase();
  try {
    const host = new URL(normalized).hostname;
    if (host === 'canvas.instructure.com') {
      return 'https://sso.canvaslms.com';
    }
    if (host === 'canvas.beta.instructure.com') {
      return 'https://sso.beta.canvaslms.com';
    }
    if (host === 'canvas.test.instructure.com') {
      return 'https://sso.test.canvaslms.com';
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve OIDC base for Canvas. Rejects typos like canvass.instructure.com —
 * never silently fall back to the institution URL when Issuer is wrong.
 */
export function resolveCanvasOidcBase(
  canvasBaseUrl: string,
  issuerUrl?: string
): string {
  const institutionBase = normalizeLmsBaseUrl(canvasBaseUrl);
  const issuer = normalizeLmsBaseUrl(issuerUrl ?? '');

  if (issuer) {
    const hostedFromIssuer = resolveHostedCanvasOidcBase(issuer);
    if (hostedFromIssuer) {
      return hostedFromIssuer;
    }

    const issuerHost = hostnameOf(issuer);
    const institutionHost = hostnameOf(institutionBase);
    if (issuerHost && institutionHost && issuerHost === institutionHost) {
      return institutionBase;
    }

    throw new Error(CANVAS_ISSUER_VALIDATION_MESSAGE);
  }

  return resolveHostedCanvasOidcBase(institutionBase) || institutionBase;
}

/** Canvas OIDC endpoints: institution URL for lmsBaseUrl; hosted issuers use sso.canvaslms.com. */
export function buildCanvasEndpoints(
  canvasBaseUrl: string,
  issuerUrl?: string
) {
  const institutionBase = normalizeLmsBaseUrl(canvasBaseUrl);
  const oidcBase = resolveCanvasOidcBase(canvasBaseUrl, issuerUrl);
  return {
    authEndpoint: `${oidcBase}/api/lti/authorize_redirect`,
    tokenEndpoint: `${oidcBase}/login/oauth2/token`,
    jwksUrl: `${oidcBase}/api/lti/security/jwks`,
    lmsBaseUrl: institutionBase,
  };
}

export function buildMoodleEndpoints(issuer: string) {
  const base = normalizeLmsBaseUrl(issuer);
  return {
    authEndpoint: `${base}/mod/lti/auth.php`,
    tokenEndpoint: `${base}/mod/lti/token.php`,
    jwksUrl: `${base}/mod/lti/certs.php`,
    lmsBaseUrl: base,
  };
}

/** Stable fingerprint of connection-critical LMS form values (for save-gating). */
export function lmsConfigFingerprint(payload: {
  schoolId?: string;
  lmsType: string;
  issuer: string;
  clientId: string;
  deploymentId?: string;
  authEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  lmsBaseUrl?: string;
  lmsApiToken?: string;
}): string {
  return JSON.stringify({
    schoolId: payload.schoolId ?? '',
    lmsType: payload.lmsType,
    issuer: normalizeLmsBaseUrl(payload.issuer),
    clientId: payload.clientId.trim(),
    deploymentId: (payload.deploymentId ?? '').trim(),
    authEndpoint: normalizeLmsBaseUrl(payload.authEndpoint),
    tokenEndpoint: normalizeLmsBaseUrl(payload.tokenEndpoint),
    jwksUrl: normalizeLmsBaseUrl(payload.jwksUrl),
    lmsBaseUrl: normalizeLmsBaseUrl(payload.lmsBaseUrl ?? ''),
    lmsApiToken: (payload.lmsApiToken ?? '').trim(),
  });
}
