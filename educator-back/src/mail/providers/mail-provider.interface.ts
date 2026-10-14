export interface MailProviderAttachment {
  name: string;
  contentType: string;
  contentInBase64: string;
  contentId?: string;
  isInline?: boolean;
}

export interface MailProviderSendParams {
  from: string;
  recipients: { address: string }[];
  content: { subject: string; html: string } | { subject: string; plainText: string };
  attachments?: MailProviderAttachment[];
}

/**
 * Transport-level abstraction MailService sends through — swappable via the
 * MAIL_PROVIDER env var (see mail-provider.factory.ts) so environments (e.g.
 * automated test runs) can disable real delivery with no code changes.
 */
export interface MailProvider {
  send(params: MailProviderSendParams): Promise<void>;
  /**
   * Optional best-effort startup warm-up (e.g. pre-fetching an auth token)
   * so the first real send after a cold start isn't the one paying that
   * latency. Never throws. Providers that need nothing warmed (e.g. Noop)
   * simply don't implement it.
   */
  warmUp?(): Promise<void>;
}
