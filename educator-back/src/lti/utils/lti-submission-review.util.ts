/**
 * LTI Submission Review claim helpers (IMS LTI Submission Review / AGS).
 * Used for Moodle gradebook review launches and Canvas SpeedGrader handoffs.
 */

const FOR_USER_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/for_user';
const MESSAGE_TYPE_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/message_type';

export const LTI_SUBMISSION_REVIEW_MESSAGE_TYPE = 'LtiSubmissionReviewRequest';

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Student LMS user id the educator is reviewing (for_user.user_id). */
export function extractForUserId(payload: Record<string, unknown>): string | null {
  const forUser = readRecord(payload[FOR_USER_CLAIM]);
  if (!forUser) {
    return null;
  }

  const userId = forUser['user_id'] ?? forUser['userId'] ?? forUser['sub'];
  if (typeof userId === 'string' && userId.trim()) {
    return userId.trim();
  }
  if (typeof userId === 'number') {
    return String(userId);
  }
  return null;
}

export function extractMessageType(payload: Record<string, unknown>): string | null {
  const raw = payload[MESSAGE_TYPE_CLAIM];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * True when this launch is a submission-review style request:
 * - explicit LtiSubmissionReviewRequest, or
 * - any launch that carries for_user (Canvas SpeedGrader basic_lti_launch often does).
 */
export function isSubmissionReviewLaunch(payload: Record<string, unknown>): boolean {
  const messageType = extractMessageType(payload);
  if (messageType === LTI_SUBMISSION_REVIEW_MESSAGE_TYPE) {
    return true;
  }
  return Boolean(extractForUserId(payload));
}

export function normalizeLineItemUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Friendly HTML page for review failures (no report data). */
export function buildSubmissionReviewErrorHtml(options: {
  title: string;
  message: string;
}): string {
  const title = escapeHtml(options.title);
  const message = escapeHtml(options.message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafaf9; color: #1c1917;
      display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 2rem;
      max-width: 28rem; text-align: center; box-shadow: 0 1px 2px rgb(0 0 0 / 6%); }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.5; color: #57534e; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
