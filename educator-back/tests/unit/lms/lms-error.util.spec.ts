import { formatLmsHttpFailure, sanitizeLmsErrorBody } from '../../../src/lms/utils/lms-error.util';
import { LmsConstants } from 'src/lms/lms.constants';

describe('lms-error.util', () => {
  it('strips HTML bodies down to a short heading or fallback', () => {
    const html =
      '<!DOCTYPE html><html><head><style>body{color:red}</style></head><body><h1>404 Not Found</h1></body></html>';
    expect(sanitizeLmsErrorBody(html)).toBe('404 Not Found');
    expect(sanitizeLmsErrorBody(html)).not.toMatch(/style|DOCTYPE/i);
  });

  it('prefers JSON error_description', () => {
    expect(
      sanitizeLmsErrorBody(
        JSON.stringify({ error: 'invalid_client', error_description: 'Unknown client_id' }),
      ),
    ).toBe('Unknown client_id');
  });

  it('maps oauth invalid_client to a plain Client ID message', () => {
    const message = formatLmsHttpFailure(400, JSON.stringify({ error: 'invalid_client' }), 'oauth');
    expect(message).toBe(LmsConstants.OAUTH_ERRORS.invalid_client);
    expect(message).not.toMatch(/\(400\)|invalid_client/);
  });

  it('keeps the generic format for unknown oauth errors and non-oauth contexts', () => {
    expect(formatLmsHttpFailure(400, JSON.stringify({ error: 'weird_error' }), 'oauth')).toContain(
      'LMS connection failed (400)',
    );
    expect(formatLmsHttpFailure(400, JSON.stringify({ error: 'invalid_client' }), 'api')).toContain(
      'LMS connection failed (400)',
    );
  });

  it('formats oauth 404 with a helpful hint and no HTML', () => {
    const message = formatLmsHttpFailure(
      404,
      '<!DOCTYPE html><html><h1>404 Not Found</h1></html>',
      'oauth',
    );
    expect(message).toContain('404');
    expect(message).toMatch(/Issuer URL|endpoint not found/i);
    expect(message).not.toMatch(/<!DOCTYPE|<style/i);
    expect(message.length).toBeLessThan(200);
  });
});
