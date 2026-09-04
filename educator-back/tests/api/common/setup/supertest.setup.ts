import * as fs from 'fs';
import * as path from 'path';
import supertest, { SuperTest, Test } from 'supertest';
import dotenv from 'dotenv';

dotenv.config();

const PORT_FILE = path.resolve(__dirname, '../../.server-port.json');

// Canonical backend base URLs per deployment environment (mirrors tests/api/utils/env.ts)
const ENV_URLS: Record<string, string> = {
  dev:  'https://dev.educatorbe.realityworksai.com',
  qa:   'https://qa.educatorbe.realityworksai.com',
  main: 'https://educatorbe.realityworksai.com',
};

// Reads the in-process server URL (pre-deploy), BASE_BACKEND_URL, or the
// canonical URL for NODE_ENV — in that priority order.
function resolveBaseUrl(): string {
  if (fs.existsSync(PORT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PORT_FILE, 'utf-8')) as { baseURL?: string };
      if (data.baseURL) return data.baseURL;
    } catch {
      // fall through
    }
  }
  const explicit = (process.env.BASE_BACKEND_URL ?? '').replace(/\/+$/, '');
  if (explicit) return explicit;
  const envKey = (process.env.NODE_ENV || 'dev').toLowerCase();
  const base = ENV_URLS[envKey] ?? ENV_URLS['dev'];
  return `${base}/api`;
}

// Returns a supertest agent bound to the resolved server URL
export function createAgent(): SuperTest<Test> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    throw new Error(
      '[supertest.setup] No server URL found.\n' +
      'Ensure the Jest globalSetup has bootstrapped the in-process server,\n' +
      'or set BASE_BACKEND_URL for live-environment tests.',
    );
  }
  return supertest(baseUrl);
}

export function getBaseUrl(): string {
  return resolveBaseUrl();
}

/**
 * Signs up (best-effort) then logs in, retrying on 429 up to maxAttempts times.
 * Returns the accessToken or '' when the environment is unreachable / rate-limited.
 */
export async function signupAndLogin(
  agent: SuperTest<Test>,
  payload: { full_name: string; email: string; password: string },
  maxAttempts = 4,
  retryDelayMs = 2000,
): Promise<string> {
  await agent.post('/auth/signup').send(payload).catch(() => {/* ignore — user may already exist */});
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await agent.post('/auth/login').send({ email: payload.email, password: payload.password });
    if (res.status === 429) {
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      continue;
    }
    return (res.body?.data?.tokens?.accessToken as string) ?? '';
  }
  return '';
}

/**
 * Default export — used as Jest globalSetup for test:api:smoke.
 * Validates BASE_BACKEND_URL is set and the deployed server is reachable.
 */
export default async function smokeSetup(): Promise<void> {
  const baseUrl = process.env.BASE_BACKEND_URL;

  if (!baseUrl) {
    throw new Error(
      '[SmokeSetup] BASE_BACKEND_URL is not set in .env.\n' +
      'Example: BASE_BACKEND_URL=https://dev.educatorbe.realityworksai.com/api',
    );
  }

  const healthUrl = baseUrl.replace(/\/api\/?$/, '') + '/healthz';
  console.log(`\n[SmokeSetup] Target environment : ${baseUrl}`);
  console.log(`[SmokeSetup] Health check URL   : ${healthUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    clearTimeout(timeout);
    if (res.status >= 502 && res.status <= 504) {
      throw new Error(`[SmokeSetup] Server returned ${res.status} — environment may be down.`);
    }
    console.log(`[SmokeSetup] Health check passed (HTTP ${res.status}) — proceeding.\n`);
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[SmokeSetup] Cannot reach ${healthUrl}.\nReason: ${msg}`);
  }
}
