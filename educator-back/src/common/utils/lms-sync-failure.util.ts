import { LmsSyncFailureReason } from 'src/common/interfaces';

const REASON_PATTERNS: Array<[LmsSyncFailureReason, RegExp]> = [
  ['lms_authentication', /token request failed|failed \((401|403)\)/i],
  ['lms_assignment_not_found', /failed \(404\)|assignment mapping .* not found/i],
  ['lms_rejected_grade', /score POST failed \((400|409|422)\)/i],
  [
    'lms_unreachable',
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|timed? ?out|aborted|failed \(5\d\d\)/i,
  ],
  [
    'lms_configuration',
    /configuration not found|host is not allowed|line item url is required|lmsBaseUrl|invalid JSON|did not return an id/i,
  ],
];

export function toLmsSyncFailureReason(
  errorMessage: string | null | undefined,
): LmsSyncFailureReason {
  if (!errorMessage) {
    return 'unknown';
  }
  return REASON_PATTERNS.find(([, pattern]) => pattern.test(errorMessage))?.[0] ?? 'unknown';
}
