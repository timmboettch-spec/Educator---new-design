/**
 * Lightweight session-readiness flag.
 *
 * Used to prevent the Axios interceptor from calling forceLogout during the
 * brief window (~0-300 ms) when SessionRestorer is still verifying credentials
 * on page load.  API calls that fire before the session is confirmed were
 * returning 401 and incorrectly triggering the "session expired" toast.
 *
 * This is a plain module-level variable (no Redux / store import) so it does
 * not create a transitive dependency on store/index.ts — which would break
 * Vitest mock validation for every reducer that lacks a `default` export.
 */

let _sessionReady = false;

/** Called by SessionRestorer after credentials are verified or cleared. */
export const markSessionReady = (): void => {
  _sessionReady = true;
};

/** Returns true once SessionRestorer has finished its initialisation pass. */
export const isSessionReady = (): boolean => _sessionReady;

/** Reset between test runs. */
export const resetSessionReady = (): void => {
  _sessionReady = false;
};
