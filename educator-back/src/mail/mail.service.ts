import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LoggerService } from '../common/services';
import { createMailProvider } from './providers/mail-provider.factory';
import { MailProvider } from './providers/mail-provider.interface';
import { MailRateLimiterService } from './mail-rate-limiter.service';
import { MailRetryService } from './mail-retry.service';
import { isSyntheticTestRecipient } from './mail-test-recipient.util';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  cid?: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, unknown>;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
  from?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private provider!: MailProvider;
  private defaultFrom!: string;
  private testMailbox!: string;
  private templatesDir!: string;
  private readonly templateCache = new Map<string, Handlebars.TemplateDelegate>();
  private static readonly TEMPLATE_CACHE_MAX = 50;
  private brandLogoAttachmentPromise?: Promise<MailAttachment[]>;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly rateLimiter: MailRateLimiterService,
    // Genuine mutual dependency — see the matching forwardRef in
    // MailRetryService's constructor for why.
    @Inject(forwardRef(() => MailRetryService)) private readonly mailRetryService: MailRetryService,
  ) { }

  onModuleInit(): void {
    this.defaultFrom = this.config.getOrThrow<string>('mail.from');
    this.testMailbox = this.config.get<string>('mail.testMailbox') ?? 'test@curionn.com';
    // Templates live next to this service (src/mail/templates in dev, dist/mail/templates in prod).
    this.templatesDir = join(__dirname, 'templates');

    // mail.provider selects the transport ('acs' by default, or 'noop' to
    // disable real delivery entirely — see providers/mail-provider.factory.ts).
    this.provider = createMailProvider(this.config, this.logger);

    // Fire-and-forget: primes the provider's auth token (if it needs one)
    // during boot instead of on the first real send — see
    // AcsMailProvider.warmUp()'s doc comment for why this matters on a cold
    // container start. Never throws, never blocks startup.
    void this.provider.warmUp?.();
  }

  /**
   * Public entry point used by every caller (signup, reports, etc.). Never
   * throws on a rate-limit hit — silently defers to MailRetryService instead,
   * since most callers (e.g. AuthService.signup()) await this directly in a
   * request path and shouldn't have to handle "try again later" themselves.
   * Still throws for genuine send failures (network/auth errors from the
   * provider) and validation errors (bad options), matching prior behavior —
   * callers already handle those themselves (e.g. reports.service.ts's own
   * catch + enqueue()).
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    const result = await this.trySendMail(options);
    if (result.sent) return;

    this.logger.warn(
      `[MailService] rate limit reached (30/min, 100/hour) — deferring send to ${Array.isArray(options.to) ? options.to.join(', ') : options.to
      } for ~${Math.round(result.retryAfterMs / 1000)}s.`,
    );
    await this.mailRetryService.enqueue(options, 'rate-limited', result.retryAfterMs);
  }

  /**
   * Lower-level send used internally by MailRetryService's own retry
   * attempts, so a still-rate-limited retry reports back as an ordinary
   * "not sent yet" instead of sendMail() re-enqueueing a brand-new job (see
   * MailRetryService.attemptSend()'s doc comment). Rejects to a rejected
   * promise only for genuine send/validation failures — a rate-limit hit is
   * a normal, non-throwing outcome here.
   */
  async trySendMail(
    options: SendMailOptions,
  ): Promise<{ sent: true } | { sent: false; retryAfterMs: number }> {
    const from = options.from ?? this.defaultFrom;

    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .flatMap((r) => r.split(','))
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((address) => ({ address }));

    if (recipients.length === 0) {
      throw new Error('MailService.sendMail called with no recipients');
    }

    // Independent of EMAIL_MODE/MAIL_PROVIDER — see mail-test-recipient.util.ts
    // for the incident this guards against.
    const syntheticRecipients = recipients.filter((r) =>
      isSyntheticTestRecipient(r.address, this.testMailbox),
    );
    if (syntheticRecipients.length > 0) {
      if (syntheticRecipients.length !== recipients.length) {
        this.logger.warn(
          `[MailService] mixed real/synthetic-test recipients in one send — skipping entirely: ${recipients.map((r) => r.address).join(', ')}`,
        );
      } else {
        this.logger.log(
          `[MailService] skipping real send — recipient(s) match the synthetic API-test pattern: ${syntheticRecipients.map((r) => r.address).join(', ')}`,
        );
      }
      return { sent: true };
    }

    let content: { subject: string; html: string } | { subject: string; plainText: string };

    if (options.template) {
      const html = await this.renderTemplate(options.template, options.context ?? {});
      content = { subject: options.subject, html };
    } else if (options.html) {
      content = { subject: options.subject, html: options.html };
    } else if (options.text) {
      content = { subject: options.subject, plainText: options.text };
    } else {
      throw new Error('MailService.sendMail requires one of: template, html, or text');
    }

    // Only reserve a rate-limit slot once we know this is a genuine,
    // well-formed send — validation/render failures above throw before
    // reaching here, so they never burn real send capacity.
    const gate = await this.rateLimiter.tryAcquire();
    if (!gate.allowed) {
      return { sent: false, retryAfterMs: gate.retryAfterMs ?? 1_000 };
    }

    const attachments = (options.attachments ?? []).map((a) => ({
      name: a.filename,
      contentType: a.contentType ?? 'application/octet-stream',
      contentInBase64:
        a.content instanceof Buffer
          ? a.content.toString('base64')
          : Buffer.from(a.content).toString('base64'),
      ...(a.cid
        ? {
          contentId: a.cid,
          isInline: true,
        }
        : {}),
    }));

    await this.provider.send({
      from,
      content,
      recipients,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    return { sent: true };
  }

  /**
   * sendMail() with the Realityworks AI brand logo auto-attached as a `cid:realityworks-ai-logo`
   * inline image — the same attachment previously hand-built at every call site (auth's OTP
   * email, several educator lifecycle emails). Callers just supply `template`/`context` as usual;
   * any `attachments` they also pass are kept alongside the logo, not replaced by it.
   */
  async sendBrandedMail(options: SendMailOptions): Promise<void> {
    const logoAttachment = await this.getBrandLogoAttachment();
    return this.sendMail({
      ...options,
      attachments: [...logoAttachment, ...(options.attachments ?? [])],
    });
  }

  private async getBrandLogoAttachment(): Promise<MailAttachment[]> {
    if (!this.brandLogoAttachmentPromise) {
      this.brandLogoAttachmentPromise = (async () => {
        try {
          const logoPath = join(__dirname, '..', 'assets', 'realityworks-ai-logo.png');
          const content = await readFile(logoPath);
          return [
            {
              filename: 'realityworks-ai-logo.png',
              contentType: 'image/png',
              content,
              cid: 'realityworks-ai-logo',
            },
          ];
        } catch (err) {
          this.logger.warn(
            `[MailService] Failed to load brand logo attachment: ${(err as Error).message}`,
          );
          return [];
        }
      })();
    }
    return this.brandLogoAttachmentPromise;
  }

  private async renderTemplate(name: string, context: Record<string, unknown>): Promise<string> {
    let tpl = this.templateCache.get(name);
    if (!tpl) {
      const path = join(this.templatesDir, `${name}.hbs`);
      const source = await readFile(path, 'utf8');
      tpl = Handlebars.compile(source, { strict: true });
      // Evict oldest entry when cache is full (LRU via Map insertion order).
      if (this.templateCache.size >= MailService.TEMPLATE_CACHE_MAX) {
        const firstKey = this.templateCache.keys().next();
        if (!firstKey.done) {
          this.templateCache.delete(firstKey.value);
        }
      }
      this.templateCache.set(name, tpl);
    }
    return tpl(context);
  }
}
