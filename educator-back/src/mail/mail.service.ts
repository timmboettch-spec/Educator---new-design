import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import * as Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
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
  private readonly logger = new Logger(MailService.name);
  private client!: Client;
  private defaultFrom!: string;
  private templatesDir!: string;
  private readonly templateCache = new Map<string, Handlebars.TemplateDelegate>();
  private static readonly TEMPLATE_CACHE_MAX = 50;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const tenantId = this.config.getOrThrow<string>('GRAPH_TENANT_ID');
    const clientId = this.config.getOrThrow<string>('GRAPH_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GRAPH_CLIENT_SECRET');

    this.defaultFrom = this.config.getOrThrow<string>('MAIL_FROM');
    // Templates live next to this service (src/mail/templates in dev, dist/mail/templates in prod).
    this.templatesDir = join(__dirname, 'templates');

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    this.client = Client.initWithMiddleware({ authProvider });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = options.from ?? this.defaultFrom;

    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .flatMap((r) => r.split(','))
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((address) => ({ emailAddress: { address } }));

    if (recipients.length === 0) {
      throw new Error('MailService.sendMail called with no recipients');
    }

    let contentType: 'HTML' | 'Text';
    let content: string;

    if (options.template) {
      contentType = 'HTML';
      content = await this.renderTemplate(options.template, options.context ?? {});
    } else if (options.html) {
      contentType = 'HTML';
      content = options.html;
    } else if (options.text) {
      contentType = 'Text';
      content = options.text;
    } else {
      throw new Error('MailService.sendMail requires one of: template, html, or text');
    }

    const attachments = (options.attachments ?? []).map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType ?? 'application/octet-stream',
      contentBytes:
        a.content instanceof Buffer
          ? a.content.toString('base64')
          : Buffer.from(a.content).toString('base64'),
    }));

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: { contentType, content },
      toRecipients: recipients,
    };

    if (attachments.length > 0) {
      message.attachments = attachments;
    }

    try {
      await this.client.api(`/users/${encodeURIComponent(from)}/sendMail`).post({
        message,
        saveToSentItems: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Graph sendMail failed for ${from} -> ${recipients.length} recipient(s): ${msg}`,
      );
      throw err;
    }
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
