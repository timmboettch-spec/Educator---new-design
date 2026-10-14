import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/services';
import { AcsMailProvider } from './acs-mail.provider';
import { NoopMailProvider } from './noop-mail.provider';
import { MailProvider } from './mail-provider.interface';

export const MAIL_PROVIDERS = ['acs', 'noop'] as const;
export type MailProviderName = (typeof MAIL_PROVIDERS)[number];

/**
 * mail.provider (MAIL_PROVIDER) selects the mail transport at startup —
 * 'acs' (default) for real Azure Communication Services delivery, or 'noop'
 * to disable sending entirely (e.g. in automated test/preview environments
 * that shouldn't risk sender-domain reputation) with no code changes.
 *
 * EMAIL_MODE=skip forces 'noop' regardless of MAIL_PROVIDER — it's the
 * existing per-env switch already deployed to dev/qa (see
 * infra/env/{dev,qa}.bicepparam's emailMode, wired to every Container App
 * including PR previews, which share dev's env), but until now only
 * reports.service.ts's separate EMAIL_MODE=file check honored it — signup,
 * password reset, etc. always sent for real via MailService regardless,
 * hard-bouncing test-generated addresses on every CI/preview run.
 */
export function createMailProvider(config: ConfigService, logger: LoggerService): MailProvider {
  const emailMode = (config.get<string>('mail.emailMode') ?? '').toLowerCase();
  const providerName = (config.get<string>('mail.provider') ?? 'acs').toLowerCase();

  if (emailMode === 'skip' || providerName === 'noop') {
    return new NoopMailProvider(logger);
  }

  const endpoint = config.getOrThrow<string>('mail.acsEndpoint');
  const clientId = config.get<string>('mail.azureClientId');
  const sendPollTimeoutMs = config.get<number>('mail.acsSendPollTimeoutMs') ?? 20_000;
  return new AcsMailProvider(endpoint, clientId, logger, sendPollTimeoutMs);
}
