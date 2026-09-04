/**
 * Runtime data store — persists test state to a JSON file so every test file
 * (which gets its own Jest module registry) can share it across the suite.
 * Set SMOKE_AUTH_TOKEN in CI to skip the live login call entirely.
 */
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const RUNTIME_FILE = join(__dirname, '../../..', '.smoke-runtime.json');

type RuntimeData = {
  accessToken?: string;
};

function read(): RuntimeData {
  if (!existsSync(RUNTIME_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(RUNTIME_FILE, 'utf8')) as RuntimeData;
  } catch {
    return {};
  }
}

function write(data: RuntimeData): void {
  writeFileSync(RUNTIME_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function setAccessToken(token: string): void {
  write({ ...read(), accessToken: token });
}

export function getAccessToken(): string {
  if (process.env.SMOKE_AUTH_TOKEN) {
    return process.env.SMOKE_AUTH_TOKEN;
  }
  return read().accessToken ?? '';
}

/** Returns true when no credentials are configured — use to skip suites gracefully. */
export function credsMissing(): boolean {
  return (
    !process.env.SMOKE_AUTH_TOKEN &&
    !process.env.SMOKE_USER_EMAIL &&
    !process.env.SMOKE_USER_PASSWORD
  );
}

/** Clears the runtime file at the start of each run to prevent stale data. */
export function clearAccessToken(): void {
  if (existsSync(RUNTIME_FILE)) {
    unlinkSync(RUNTIME_FILE);
  }
}
