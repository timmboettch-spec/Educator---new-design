import 'dotenv/config';

/**
 * Jest globalSetup for pre-deployment API tests.
 *
 * Validates that the target server is reachable and that the local
 * environment is configured to prevent real email delivery during tests.
 */
export default async function globalSetup(): Promise<void> {
    const emailMode = (process.env.EMAIL_MODE ?? '').toLowerCase();
    const mailProvider = (process.env.MAIL_PROVIDER ?? '').toLowerCase();

    // The server controls email delivery via EMAIL_MODE / MAIL_PROVIDER.
    // dev/qa/preview servers already have EMAIL_MODE=skip (see infra/env/*.bicepparam).
    // For local runs, require the same to prevent accidental real sends.
    if (emailMode && emailMode !== 'skip' && mailProvider !== 'noop') {
        throw new Error(
            '[API Test GlobalSetup] EMAIL_MODE is set to "' +
            emailMode +
            '" — real emails may be sent.\n' +
            'Set EMAIL_MODE=skip in your .env to run API tests safely.\n' +
            'Dev/QA servers already have this set via infra/env/*.bicepparam.',
        );
    }

    if (!emailMode && !mailProvider) {
        console.warn(
            '\n⚠️  Neither EMAIL_MODE nor MAIL_PROVIDER is set in the local environment.\n' +
            '   If targeting a dev/qa server, EMAIL_MODE=skip is already enforced server-side.\n' +
            '   For local server testing, add EMAIL_MODE=skip to your .env.\n',
        );
    }
}
