import { toLmsSyncFailureReason } from '../../../src/common/utils/lms-sync-failure.util';

describe('toLmsSyncFailureReason', () => {
  it.each([
    ['LMS token request failed (401): invalid_client', 'lms_authentication'],
    [
      '[LmsAuth] Token request failed (400) for purpose=ags-score: invalid_scope',
      'lms_authentication',
    ],
    ['LTI AGS score POST failed (403): forbidden', 'lms_authentication'],
    ['AGS line items GET failed (401): unauthorized', 'lms_authentication'],
    ['LTI AGS score POST failed (404): not found', 'lms_assignment_not_found'],
    ['Assignment mapping 1f2e not found', 'lms_assignment_not_found'],
    ['LTI AGS score POST failed (422): user is not enrolled', 'lms_rejected_grade'],
    ['LTI AGS score POST failed (400): invalid score', 'lms_rejected_grade'],
    ['fetch failed', 'lms_unreachable'],
    ['connect ECONNREFUSED 10.0.0.5:443', 'lms_unreachable'],
    ['LTI AGS score POST failed (503): unavailable', 'lms_unreachable'],
    ['LMS configuration not found for this school', 'lms_configuration'],
    ['Line item URL host is not allowed for school abc', 'lms_configuration'],
    ['Something unexpected', 'unknown'],
    [null, 'unknown'],
  ])('maps %p to %p', (errorMessage, expected) => {
    expect(toLmsSyncFailureReason(errorMessage)).toBe(expected);
  });
});
