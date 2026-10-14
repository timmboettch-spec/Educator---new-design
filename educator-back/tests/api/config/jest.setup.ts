import 'dotenv/config';

/**
 * Per-suite setup for pre-deployment API tests (npm run test:api).
 * Runs after the Jest test framework is installed in the environment.
 */

// Extend timeout to accommodate rate-limit retries in beforeAll login calls
jest.setTimeout(60000);

// API tests hit a live server — real email delivery is controlled server-side
// by EMAIL_MODE=skip (set in dev/qa/preview via infra/env/*.bicepparam).
// This guard warns if the *local* .env suggests a non-skip configuration,
// which likely means the target server could send real emails.
if (
    process.env.EMAIL_MODE &&
    process.env.EMAIL_MODE !== 'skip' &&
    process.env.MAIL_PROVIDER !== 'noop'
) {
    console.warn(
        '\n⚠️  EMAIL_MODE is not "skip" and MAIL_PROVIDER is not "noop".\n' +
        '   The target server may send real emails through ACS.\n' +
        '   Ensure the server is running with EMAIL_MODE=skip to prevent this.\n',
    );
}
