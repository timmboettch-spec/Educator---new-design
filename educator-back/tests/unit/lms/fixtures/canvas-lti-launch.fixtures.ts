/**
 * Canvas-shaped LTI 1.3 launch id_token payloads (unsigned fixtures).
 * Use until a real Canvas Test/Beta sandbox is available.
 *
 * Claim shapes follow IMS LTI 1.3 + Canvas NRPS URL conventions:
 * https://{host}/api/lti/courses/{courseId}/names_and_roles
 */

export const CANVAS_TEST_ISSUER = 'https://canvas.test.instructure.com';
export const CANVAS_CLIENT_ID = '10000000000001';
export const CANVAS_DEPLOYMENT_ID = '7:d8f3a2b1c0e9';
export const CANVAS_COURSE_ID = '123';
export const CANVAS_COURSE_LABEL = 'BIO101';
export const CANVAS_COURSE_TITLE = 'Intro Biology';

/** Typical Canvas LTI user_id style (opaque hex). */
export const CANVAS_TEACHER_SUB = '535fa085f22b4655f48cd5a36a9215f64c062838';
export const CANVAS_STUDENT_SUB = 'a1b2c3d4e5f6478901234567890abcde';

export const CANVAS_NRPS_URL = `${CANVAS_TEST_ISSUER}/api/lti/courses/${CANVAS_COURSE_ID}/names_and_roles`;

const LTI_MESSAGE_TYPE = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const LTI_VERSION = 'https://purl.imsglobal.org/spec/lti/claim/version';
const LTI_DEPLOYMENT_ID = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const LTI_ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const LTI_CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context';
const LTI_RESOURCE_LINK = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const LTI_NRPS = 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice';

export type CanvasLaunchPayloadOptions = {
  issuer?: string;
  sub?: string;
  email?: string;
  name?: string;
  roles?: string[];
  courseId?: string;
  courseLabel?: string;
  courseTitle?: string;
  clientId?: string;
  /** When true, set aud as [clientId] and include azp (Canvas-style). */
  audAsArray?: boolean;
  /**
   * Deployment id claim. Pass `null` to omit the claim (fail-closed tests).
   * Omit / undefined → default Canvas deployment id.
   */
  deploymentId?: string | null;
  nrpsUrl?: string | null;
  nonce?: string;
  iat?: number;
  exp?: number;
  resourceLinkId?: string;
};

function baseClaims(
  opts: CanvasLaunchPayloadOptions,
  defaults: {
    sub: string;
    roles: string[];
    email: string;
    name: string;
  },
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const issuer = opts.issuer ?? CANVAS_TEST_ISSUER;
  const clientId = opts.clientId ?? CANVAS_CLIENT_ID;
  const courseId = opts.courseId ?? CANVAS_COURSE_ID;

  const payload: Record<string, unknown> = {
    iss: issuer,
    sub: opts.sub ?? defaults.sub,
    aud: opts.audAsArray ? [clientId] : clientId,
    exp: opts.exp ?? now + 300,
    iat: opts.iat ?? now,
    nonce: opts.nonce ?? `canvas-test-nonce-${now}`,
    email: opts.email ?? defaults.email,
    name: opts.name ?? defaults.name,
    [LTI_MESSAGE_TYPE]: 'LtiResourceLinkRequest',
    [LTI_VERSION]: '1.3.0',
    [LTI_ROLES]: opts.roles ?? defaults.roles,
    [LTI_CONTEXT]: {
      id: courseId,
      label: opts.courseLabel ?? CANVAS_COURSE_LABEL,
      title: opts.courseTitle ?? CANVAS_COURSE_TITLE,
    },
    [LTI_RESOURCE_LINK]: {
      id: opts.resourceLinkId ?? `resource-link-${courseId}`,
      title: opts.courseTitle ?? CANVAS_COURSE_TITLE,
    },
  };

  if (opts.deploymentId !== null) {
    payload[LTI_DEPLOYMENT_ID] = opts.deploymentId ?? CANVAS_DEPLOYMENT_ID;
  }

  if (opts.audAsArray) {
    payload.azp = clientId;
  }

  return payload;
}

/** Educator / teacher launch payload with Canvas NRPS claim. */
export function buildCanvasEducatorLaunchPayload(
  opts: CanvasLaunchPayloadOptions = {},
): Record<string, unknown> {
  const courseId = opts.courseId ?? CANVAS_COURSE_ID;
  const issuer = opts.issuer ?? CANVAS_TEST_ISSUER;
  const payload = baseClaims(opts, {
    sub: CANVAS_TEACHER_SUB,
    email: 'ada@school.edu',
    name: 'Ada Teacher',
    roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
  });

  if (opts.nrpsUrl !== null) {
    payload[LTI_NRPS] = {
      context_memberships_url:
        opts.nrpsUrl ?? `${issuer}/api/lti/courses/${courseId}/names_and_roles`,
      service_versions: ['2.0'],
    };
  }

  return payload;
}

/** Student launch payload (Learner role; no NRPS by default). */
export function buildCanvasStudentLaunchPayload(
  opts: CanvasLaunchPayloadOptions = {},
): Record<string, unknown> {
  return baseClaims(opts, {
    sub: CANVAS_STUDENT_SUB,
    email: 'bob@school.edu',
    name: 'Bob Student',
    roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
  });
}

/** Resolve client id the same way educator/student launch does (aud string | aud[] | azp). */
export function resolveLaunchClientId(payload: Record<string, unknown>): string | null {
  if (typeof payload.aud === 'string' && payload.aud.trim()) {
    return payload.aud.trim();
  }
  if (Array.isArray(payload.aud)) {
    const first = payload.aud.find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    if (first) {
      return first.trim();
    }
  }
  if (typeof payload.azp === 'string' && payload.azp.trim()) {
    return payload.azp.trim();
  }
  return null;
}

/** Read NRPS memberships URL from an LTI launch payload (educator path). */
export function extractNrpsUrlFromLaunchPayload(payload: Record<string, unknown>): string {
  const nrpsClaim = payload[LTI_NRPS] as Record<string, unknown> | undefined;
  return typeof nrpsClaim?.['context_memberships_url'] === 'string'
    ? nrpsClaim['context_memberships_url']
    : '';
}
