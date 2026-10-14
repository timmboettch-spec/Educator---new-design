import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  from: process.env.MAIL_FROM,
  // Selects MailService's transport ('acs' default, or 'noop' to disable
  // real delivery — see src/mail/providers/mail-provider.factory.ts).
  provider: process.env.MAIL_PROVIDER,
  // ACS Communication Services endpoint + managed identity client ID for the
  // 'acs' provider (see src/mail/providers/acs-mail.provider.ts).
  acsEndpoint: process.env.ACS_ENDPOINT,
  azureClientId: process.env.AZURE_CLIENT_ID,
  reportEmailTo: process.env.REPORT_EMAIL_TO,
  emailMode: process.env.EMAIL_MODE,
  // Base test mailbox tests/api/utils/env.ts's testEmail() sub-addresses
  // (e.g. test+auth-ctrl-<ts>@curionn.com) — see
  // src/mail/mail-test-recipient.util.ts for why the app itself also
  // recognizes this pattern.
  testMailbox: process.env.TEST_EMAIL_ADDRESS || 'test@curionn.com',
  // Cap on how long AcsMailProvider.send() waits for ACS's send operation to
  // reach a terminal state before returning to the caller — see
  // acs-mail.provider.ts's `send()` doc comment for why this exists.
  acsSendPollTimeoutMs: Number(process.env.ACS_SEND_POLL_TIMEOUT_MS) || 20_000,
  // Explicit per-report sender override (reports.service.ts's
  // sendReportEmail) — distinct from `from`/MAIL_FROM above, which is
  // MailService's own default sender.
  emailFrom: process.env.EMAIL_FROM,
  logoUrl: process.env.EMAIL_LOGO_URL,
  supportEmail: process.env.SUPPORT_EMAIL ?? 'productsupport@realityworks.com'
}));
