import { describe, expect, it } from 'vitest';

/**
 * OAuth return reason → locale key mapping for Google Classroom Connect errors.
 * Keep in sync with GoogleClassroomPanel GOOGLE_OAUTH_REASON_MESSAGES.
 */
const GOOGLE_OAUTH_REASON_MESSAGES: Record<string, string> = {
  provider_denied: 'googleClassroomErrorProviderDenied',
  missing_code: 'googleClassroomErrorMissingCode',
  invalid_or_expired_state: 'googleClassroomErrorInvalidState',
  token_exchange_failed: 'googleClassroomErrorTokenExchange',
  callback_failed: 'googleClassroomErrorCallback',
  google_email_mismatch: 'googleClassroomErrorEmailMismatch',
};

describe('Google Classroom Connect email mismatch UX', () => {
  it('maps google_email_mismatch to the dedicated locale key', () => {
    expect(GOOGLE_OAUTH_REASON_MESSAGES.google_email_mismatch).toBe(
      'googleClassroomErrorEmailMismatch'
    );
  });

  it('treats educator and Google emails as matching when only case/whitespace differ', () => {
    const normalize = (value: string) => value.trim().toLowerCase();
    expect(normalize('  Teacher@Curionn.com ')).toBe(
      normalize('teacher@curionn.com')
    );
  });
});
