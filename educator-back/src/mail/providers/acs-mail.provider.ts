import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  TokenCredential,
} from '@azure/identity';
import { EmailClient } from '@azure/communication-email';
import { LoggerService } from '../../common/services';
import { MailProvider, MailProviderSendParams } from './mail-provider.interface';

// The exact scope @azure/communication-email's EmailClient requests when
// given a TokenCredential — confirmed by reading
// @azure/communication-common/dist/commonjs/credential/communicationAuthPolicy.js
// (createCommunicationAuthPolicy -> bearerTokenAuthenticationPolicy). Token
// caches are keyed by the exact scope string, so warmUp() below must request
// this precise value (double slash included) or it primes an unrelated
// cache entry the real send can't reuse — the SDK's own EntraTokenCredential
// class uses a different scope ('.../clients/.default') for a different,
// Teams-extension-only auth path we don't use.
const ACS_TOKEN_SCOPE = 'https://communication.azure.com//.default';

/**
 * Real transport: sends via Azure Communication Services Email using this
 * app's user-assigned managed identity (same one already wired for Redis and
 * the App Insights Query API — see AZURE_CLIENT_ID in
 * infra/modules/containerApp-backend.bicep). Its service principal is
 * granted the "Communication and Email Service Owner" role directly on the
 * ACS resource (infra/modules/acsEmail.bicep), so no connection
 * string/access key is needed. AZURE_CLIENT_ID is only set in deployed
 * environments; locally (no managed identity available) this falls back to
 * DefaultAzureCredential (e.g. `az login`), matching the pattern in
 * TelemetryAnalyticsService.
 */
export class AcsMailProvider implements MailProvider {
  private readonly client: EmailClient;
  private readonly credential: TokenCredential;

  constructor(
    endpoint: string,
    clientId: string | undefined,
    private readonly logger: LoggerService,
    private readonly sendPollTimeoutMs: number = 20_000,
  ) {
    this.credential = clientId
      ? new ManagedIdentityCredential({ clientId })
      : new DefaultAzureCredential();
    this.client = new EmailClient(endpoint, this.credential);
  }

  /**
   * Best-effort token pre-fetch, called once from MailService.onModuleInit()
   * without being awaited. The SDK only acquires a token lazily, on the
   * first real send — on a just-started container, that first send eats the
   * managed identity's IMDS token-fetch latency on top of the send itself,
   * which is exactly what made the very first forgot-password/report-email
   * call after a cold deploy intermittently fail or exceed the caller's
   * timeout (observed 3x in a row against a freshly deployed preview,
   * cleared instantly on manual retest once the token was cached). Priming
   * the cache here moves that latency to startup instead. Failures are
   * logged, not thrown — sendMail() still works either way, this only
   * shaves latency off the first real call.
   */
  async warmUp(): Promise<void> {
    try {
      await this.credential.getToken(ACS_TOKEN_SCOPE);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AcsMailProvider warm-up token fetch failed (non-fatal): ${msg}`);
    }
  }

  /**
   * Confirmed against Dev logs: several `forgot-password` requests were
   * failing with a generic 408 at exactly the global RequestTimeoutInterceptor
   * ceiling (~60000ms), even though the OTP/reset_token had already been
   * generated. Root cause is here — `pollUntilDone()` blocks the whole HTTP
   * request until ACS's async send operation reaches a terminal state, and
   * ACS can take longer than that (observed alongside
   * EmailDroppedAllRecipientsSuppressed errors, i.e. quota/suppression-list
   * handling) — so the caller's timeout fires first and the client never
   * even learns whether the OTP was usable.
   *
   * beginSend() resolving means ACS has already accepted the send request,
   * so once that happens we only wait up to `sendPollTimeoutMs` (well under
   * the global API timeout) for a fast terminal result; if ACS is still
   * processing after that, we stop blocking the caller and let the poll
   * finish in the background, only logging its outcome. This preserves
   * today's behavior (immediate success/failure) for the common fast case.
   */
  async send(params: MailProviderSendParams): Promise<void> {
    const target = `${params.from} -> ${params.recipients.length} recipient(s)`;
    let poller: Awaited<ReturnType<EmailClient['beginSend']>>;

    try {
      poller = await this.client.beginSend({
        senderAddress: params.from,
        content: params.content,
        recipients: { to: params.recipients },
        attachments: params.attachments?.length ? params.attachments : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`ACS Email beginSend failed for ${target}: ${msg}`);
      throw err;
    }

    const pollDone = poller.pollUntilDone().then(
      () => ({ status: 'fulfilled' as const }),
      (err: unknown) => ({ status: 'rejected' as const, err }),
    );

    const settledOrTimedOut = await Promise.race([
      pollDone,
      new Promise<{ status: 'timedOut' }>((resolve) =>
        setTimeout(() => resolve({ status: 'timedOut' }), this.sendPollTimeoutMs),
      ),
    ]);

    if (settledOrTimedOut.status === 'timedOut') {
      this.logger.warn(
        `ACS Email send for ${target} accepted but still processing after ${this.sendPollTimeoutMs}ms — continuing in the background instead of blocking the caller.`,
      );
      void pollDone.then((result) => {
        if (result.status === 'rejected') {
          const msg = result.err instanceof Error ? result.err.message : String(result.err);
          this.logger.error(`ACS Email send for ${target} failed (backgrounded poll): ${msg}`);
        }
      });
      return;
    }

    if (settledOrTimedOut.status === 'rejected') {
      const err = settledOrTimedOut.err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`ACS Email sendMail failed for ${target}: ${msg}`);
      throw err;
    }
  }
}
