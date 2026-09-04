/**
 * Smoke Cleanup Registry
 * ──────────────────────
 * IMPORTANT: Smoke tests must NEVER modify real data.
 *
 * Rules:
 *   1. Any resource created by a smoke test MUST use the SMOKE_PREFIX so it
 *      is identifiable and safe to delete.
 *   2. Call `registerForCleanup()` immediately after creating a resource.
 *   3. The global teardown (`smoke-teardown.ts`) deletes everything registered.
 *   4. If deletion fails, it warns — it never throws and never touches
 *      resources that were NOT registered by this registry.
 *
 * Currently all smoke tests are read-only (GET + failing POSTs).
 * This registry exists so future smoke tests that need to POST/PATCH/DELETE
 * have a safe, auditable cleanup path from day one.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const SMOKE_PREFIX = '__smoke__';

/** Marker added to every smoke-created payload — checked before deletion. */
export const SMOKE_TAG = { _smokeTest: true } as const;

const REGISTRY_FILE = join(__dirname, '.smoke-cleanup.json');

export interface CleanupEntry {
  method: 'DELETE' | 'PATCH';
  url: string; // full URL  e.g. https://host/api/scenarios/__smoke__-xyz
  description: string; // human label for log output
}

/** Load the current registry from disk. */
function load(): CleanupEntry[] {
  if (!existsSync(REGISTRY_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as CleanupEntry[];
  } catch {
    return [];
  }
}

/** Persist the registry to disk. */
function save(entries: CleanupEntry[]): void {
  writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Register a resource for post-suite deletion.
 * Call this immediately after a successful smoke-test POST/PUT.
 *
 * @example
 *   const res = await smokePost('/scenarios', { id: '__smoke__-001', ... });
 *   if (res.status === 201) registerForCleanup({ method: 'DELETE', url: `${BASE}/scenarios/__smoke__-001`, description: 'smoke scenario' });
 */
export function registerForCleanup(entry: CleanupEntry): void {
  if (!entry.url.includes(SMOKE_PREFIX)) {
    throw new Error(
      `[smoke-cleanup] SAFETY GUARD: refused to register "${entry.url}" — ` +
        `URL must contain "${SMOKE_PREFIX}". Only smoke-created resources may be registered.`,
    );
  }
  const entries = load();
  entries.push(entry);
  save(entries);
}

/** Return all registered entries (used by teardown). */
export function getCleanupRegistry(): CleanupEntry[] {
  return load();
}

/** Clear the registry file (called by teardown after cleanup completes). */
export function clearRegistry(): void {
  save([]);
}
