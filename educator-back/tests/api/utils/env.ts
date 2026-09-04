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
  dev:  'https://dev.educatorbe.realityworksai.com',
  qa:   'https://qa.educatorbe.realityworksai.com',
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

export default config;
