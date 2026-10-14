import dotenv from 'dotenv';
import type { TestConfig, LogLevel } from '../types/api.types';

// Load environment variables from .env file
dotenv.config();

const getLogLevel = (value: string | undefined): LogLevel => {
  const level = value ?? 'info';
  const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  return validLevels.includes(level as LogLevel) ? (level as LogLevel) : 'info';
};

// Canonical backend base URLs per deployment environment (no trailing slash, no /api suffix)
const ENV_URLS: Record<string, string> = {
  dev: 'https://dev.educatorbe.realityworksai.com',
  qa: 'https://qa.educatorbe.realityworksai.com',
  main: 'https://educatorbe.realityworksai.com',
};

/**
 * Get BASE_URL from BASE_BACKEND_URL, falling back to the canonical URL for
 * the current NODE_ENV when BASE_BACKEND_URL is absent (used by the CI
 * test-api job which passes node-env but no explicit base-url).
 * Pre-deployment suite: apiClient.ts overrides this with the local server port file.
 */
const getBaseURL = (): string => {
  const explicit = (process.env.BASE_BACKEND_URL || '').replace(/\/+$/, '');
  if (explicit) return explicit.endsWith('/api') ? explicit : `${explicit}/api`;
  const envKey = (process.env.NODE_ENV || 'dev').toLowerCase();
  const base = ENV_URLS[envKey] ?? ENV_URLS['dev'];
  return `${base}/api`;
};

export const config: TestConfig = {
  baseURL: getBaseURL(),
  maxRetries: Number.parseInt(process.env.MAX_RETRIES ?? '0', 10),
  retryDelay: Number.parseInt(process.env.RETRY_DELAY ?? '500', 10),
  logLevel: getLogLevel(process.env.LOG_LEVEL),
};

// Account-creation signup (AuthService.signup) sends mail via MailService.
// In dev/qa/preview (EMAIL_MODE=skip) it no-ops entirely. When the target
// server runs EMAIL_MODE=live, "+" sub-addresses of TEST_EMAIL_ADDRESS (e.g.
// test+prefix-<timestamp>@curionn.com) ARE sent for real — curionn.com has a
// catch-all mailbox for them (see isSyntheticTestRecipient in
// src/mail/mail-test-recipient.util.ts). This address is used for both
// unique account identity (signup dedup) and, when live, real delivery.
const TEST_MAILBOX = (process.env.TEST_EMAIL_ADDRESS ?? 'test@curionn.com').trim();
const [TEST_MAILBOX_LOCAL, TEST_MAILBOX_DOMAIN] = TEST_MAILBOX.split('@');
if (!TEST_MAILBOX_LOCAL || !TEST_MAILBOX_DOMAIN) {
  throw new Error(`TEST_EMAIL_ADDRESS is not a valid email address: "${TEST_MAILBOX}"`);
}

/** Generates a unique test email for account identity — sent for real when the target server's EMAIL_MODE=live. */
export function testEmail(prefix: string): string {
  return `${TEST_MAILBOX_LOCAL}+${prefix}-${Date.now()}@${TEST_MAILBOX_DOMAIN}`;
}

export default config;
