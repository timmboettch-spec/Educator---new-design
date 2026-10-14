import { SignJWT, jwtVerify } from 'jose';

/** Query param on Canvas AGS `submission_data` launch URLs (and OIDC target_link_uri). */
export const CANVAS_REVIEW_QUERY_PARAM = 'rw_review';

const REVIEW_TOKEN_TYP = 'rw_canvas_review';
/** Long-lived: teachers open SpeedGrader days/weeks after grade passback. */
const REVIEW_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

export type CanvasReviewClaims = {
  classId: string;
  studentCode: string;
  simulationId: string;
  reportId: string;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function buildReportDetailRedirectPath(claims: CanvasReviewClaims): string {
  return (
    `/report-detail?` +
    new URLSearchParams({
      classId: claims.classId,
      studentCode: claims.studentCode,
      simulationId: claims.simulationId,
      reportId: claims.reportId,
    }).toString()
  );
}

/** Sign a Canvas SpeedGrader review token embedded in the AGS submission launch URL. */
export async function signCanvasReviewToken(
  claims: CanvasReviewClaims,
  secret: string,
): Promise<string> {
  return new SignJWT({
    classId: claims.classId,
    studentCode: claims.studentCode,
    simulationId: claims.simulationId,
    reportId: claims.reportId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: REVIEW_TOKEN_TYP })
    .setIssuedAt()
    .setExpirationTime(`${REVIEW_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function verifyCanvasReviewToken(
  token: string,
  secret: string,
): Promise<CanvasReviewClaims | null> {
  const trimmed = token.trim();
  if (!trimmed || !secret.trim()) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(trimmed, secretKey(secret), {
      algorithms: ['HS256'],
    });
    const classId = typeof payload.classId === 'string' ? payload.classId.trim() : '';
    const studentCode =
      typeof payload.studentCode === 'string' ? payload.studentCode.trim() : '';
    const simulationId =
      typeof payload.simulationId === 'string' ? payload.simulationId.trim() : '';
    const reportId = typeof payload.reportId === 'string' ? payload.reportId.trim() : '';
    if (!classId || !studentCode || !simulationId || !reportId) {
      return null;
    }
    return { classId, studentCode, simulationId, reportId };
  } catch {
    return null;
  }
}

/** Pull `rw_review` from an OIDC `target_link_uri` (Canvas submission launch URL). */
export function extractCanvasReviewTokenFromTargetLinkUri(
  targetLinkUri: string | undefined | null,
): string | null {
  const raw = typeof targetLinkUri === 'string' ? targetLinkUri.trim() : '';
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    const token = url.searchParams.get(CANVAS_REVIEW_QUERY_PARAM)?.trim();
    return token || null;
  } catch {
    // Relative or malformed — try manual query parse.
    const qIndex = raw.indexOf('?');
    if (qIndex < 0) {
      return null;
    }
    const params = new URLSearchParams(raw.slice(qIndex + 1));
    const token = params.get(CANVAS_REVIEW_QUERY_PARAM)?.trim();
    return token || null;
  }
}

export async function buildCanvasSubmissionLaunchUrl(args: {
  apiBaseUrl: string;
  secret: string;
  claims: CanvasReviewClaims;
}): Promise<string> {
  const base = args.apiBaseUrl.replace(/\/$/, '');
  const token = await signCanvasReviewToken(args.claims, args.secret);
  const url = new URL(`${base}/api/lti/launch`);
  url.searchParams.set(CANVAS_REVIEW_QUERY_PARAM, token);
  return url.toString();
}
