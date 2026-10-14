import * as fs from 'fs';
import * as path from 'path';
import supertest, { Response, SuperTest, Test } from 'supertest';
import dotenv from 'dotenv';
import { ENDPOINTS } from '../constants/endpoints';
import { AuthTransportConstants } from '../constants/auth.constants';

dotenv.config();

const PORT_FILE = path.resolve(__dirname, '../../.server-port.json');

// Canonical backend base URLs per deployment environment (mirrors tests/api/utils/env.ts)
const ENV_URLS: Record<string, string> = {
  dev: 'https://dev.educatorbe.realityworksai.com',
  qa: 'https://qa.educatorbe.realityworksai.com',
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

/**
 * CSRF tokens are issued per request by `CsrfService` and stored in Redis
 * un-scoped (`csrf:<token>` → `'valid'`), so `CsrfGuard.validateToken` accepts
 * any live token regardless of which account asked for it. One token per run is
 * therefore enough, and caching it here keeps the suites from spending an extra
 * round trip before every mutating call.
 */
let cachedCsrfToken = '';

/** Reads the `accessToken` cookie out of a response's `Set-Cookie` header. */
export function extractAccessTokenFromResponse(res: Response): string {
  const raw: unknown = res.headers?.['set-cookie'];
  const cookies: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? [raw]
      : [];

  for (const cookie of cookies) {
    const match = new RegExp(
      `(?:^|;\\s*)${AuthTransportConstants.ACCESS_TOKEN_COOKIE}=([^;]*)`,
    ).exec(cookie);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

/**
 * Wraps the state-changing verbs so each request carries the cached CSRF token.
 *
 * `CsrfGuard` is registered as an `APP_GUARD` and rejects every POST/PUT/PATCH/
 * DELETE without an `x-csrf-token` header with a 403, which would otherwise mask
 * the status each spec is actually asserting. Reads are left untouched — the
 * guard short-circuits on non-state-changing methods.
 */
function attachCsrfHeader(agent: object): void {
  const target = agent as unknown as Record<string, (url: string) => Test>;

  for (const verb of AuthTransportConstants.CSRF_PROTECTED_METHODS) {
    const original = target[verb].bind(agent);
    target[verb] = (url: string): Test => {
      const request = original(url);
      return cachedCsrfToken
        ? request.set(AuthTransportConstants.CSRF_HEADER, cachedCsrfToken)
        : request;
    };
  }
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
  const agent = supertest(baseUrl);
  attachCsrfHeader(agent);
  return agent;
}

export function getBaseUrl(): string {
  return resolveBaseUrl();
}

/**
 * Fetches a CSRF token with an already-authenticated access token and caches it
 * for the rest of the run. Best-effort: a failure leaves the cache untouched so
 * the caller still gets its access token back.
 */
export async function primeCsrfToken(agent: SuperTest<Test>, accessToken: string): Promise<string> {
  if (cachedCsrfToken || !accessToken) return cachedCsrfToken;

  try {
    const res = await agent
      .get(ENDPOINTS.AUTH.CSRF_TOKEN)
      .set('Authorization', `Bearer ${accessToken}`);
    const token = res.body?.data?.csrfToken as string | undefined;
    if (token) cachedCsrfToken = token;
  } catch {
    /* best-effort — leave the cache empty and let the guard answer */
  }

  return cachedCsrfToken;
}

/**
 * Creates the account, best-effort.
 *
 * `SignupReqDto` names the display-name field `fullName`; the deployments this
 * suite also runs against still name it `full_name`. The global `ValidationPipe`
 * runs with `forbidNonWhitelisted`, so the wrong spelling is not ignored — it is
 * a 400 ("property full_name should not exist"), the account is never created,
 * and every later login returns 401. Sending both spellings at once fails on
 * both, so this tries the current one and falls back on a validation rejection.
 */
export async function signup(
  agent: SuperTest<Test>,
  payload: { full_name: string; email: string; password: string },
): Promise<void> {
  const { full_name: fullName, email, password } = payload;

  const res = await agent
    .post(ENDPOINTS.AUTH.SIGNUP)
    .send({ fullName, email, password })
    .catch(() => null);

  if (res && res.status !== 400) return;

  await agent
    .post(ENDPOINTS.AUTH.SIGNUP)
    .send({ full_name: fullName, email, password })
    .catch(() => {
      /* ignore — the user may already exist */
    });
}

/**
 * Signs up (best-effort) then logs in, retrying on 429 up to maxAttempts times.
 * Returns the accessToken or '' when the environment is unreachable / rate-limited.
 *
 * The token comes off the httpOnly `accessToken` cookie the server sets via
 * `TokenService.setAuthCookies` — `POST /auth/login` returns only the user and an
 * `accessStatus` in its body, no `tokens` object. It is handed back as a plain
 * string so call sites keep sending it as `Authorization: Bearer <token>`, which
 * `extractAccessToken` still honours; a cookie jar would silently authenticate
 * the suites' deliberate no-token requests.
 */
export async function signupAndLogin(
  agent: SuperTest<Test>,
  payload: { full_name: string; email: string; password: string },
  maxAttempts = 4,
  retryDelayMs = 2000,
): Promise<string> {
  await signup(agent, payload);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGIN)
      .send({ email: payload.email, password: payload.password });
    if (res.status === 429) {
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      continue;
    }

    const accessToken =
      extractAccessTokenFromResponse(res) ||
      ((res.body?.data?.tokens?.accessToken as string) ?? '');
    await primeCsrfToken(agent, accessToken);
    return accessToken;
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
