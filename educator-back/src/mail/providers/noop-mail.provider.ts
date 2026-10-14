import { LoggerService } from '../../common/services';
import { MailProvider, MailProviderSendParams } from './mail-provider.interface';

/**
 * No-op transport — logs what would have been sent and resolves immediately,
 * without making any external call. Selected via MAIL_PROVIDER=noop so
 * automated test environments can disable real delivery without touching
 * application code (see mail-provider.factory.ts).
 */
export class NoopMailProvider implements MailProvider {
  constructor(private readonly logger: LoggerService) {}

  send(params: MailProviderSendParams): Promise<void> {
    this.logger.log(
      `[NoopMailProvider] MAIL_PROVIDER=noop — skipping send from ${params.from} to ${params.recipients
        .map((r) => r.address)
        .join(', ')} (subject: "${params.content.subject}")`,
    );
    return Promise.resolve();
  }
}
