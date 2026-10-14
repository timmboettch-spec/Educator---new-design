/**
 * LTI routes that share a higher per-IP rate limit for classroom bursts
 * (login → callback → launch → session/exchange). RWAI-3154.
 */
const LTI_CLASSROOM_BURST_SUFFIXES = [
  '/lti/login',
  '/lti/studentlogin',
  '/lti/callback',
  '/lti/studentcallback',
  '/lti/launch',
  '/lti/studentlaunch',
  '/lti/session/exchange',
] as const;

/**
 * Returns true when `path` is an LTI classroom-burst route (with or without `/api` prefix).
 * Query strings and trailing slashes are ignored.
 */
export function isLtiClassroomBurstPath(path: string | undefined | null): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  const normalized = path.split('?')[0]?.replace(/\/+$/, '') ?? '';
  if (!normalized) {
    return false;
  }

  return LTI_CLASSROOM_BURST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(suffix),
  );
}
