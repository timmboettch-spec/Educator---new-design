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

/** True while LTI session exchange replaces an existing portal JWT. */
let _ltiSessionHandoff = false;

type HandoffListener = () => void;
const handoffListeners = new Set<HandoffListener>();

function notifyLtiHandoffListeners(): void {
  handoffListeners.forEach((listener) => listener());
}

/** Called by SessionRestorer after credentials are verified or cleared. */
export const markSessionReady = (): void => {
  _sessionReady = true;
};

/** Returns true once SessionRestorer has finished its initialisation pass. */
export const isSessionReady = (): boolean => _sessionReady;

/** Reset between test runs. */
export const resetSessionReady = (): void => {
  _sessionReady = false;
  _ltiSessionHandoff = false;
  notifyLtiHandoffListeners();
};

/**
 * LTI launch is swapping the portal session (e.g. admin → educator).
 * While true, 401s from the revoked prior JWT must not forceLogout and wipe
 * the new educator cookies/Redux that were just written.
 * AppRouter also suppresses auth-based redirects so users only see one route.
 */
export const beginLtiSessionHandoff = (): void => {
  if (_ltiSessionHandoff) return;
  _ltiSessionHandoff = true;
  notifyLtiHandoffListeners();
};

export const endLtiSessionHandoff = (): void => {
  if (!_ltiSessionHandoff) return;
  _ltiSessionHandoff = false;
  notifyLtiHandoffListeners();
};

export const isLtiSessionHandoff = (): boolean => _ltiSessionHandoff;

/** Subscribe to LTI handoff start/end so React can re-render (loader / routing). */
export const subscribeLtiSessionHandoff = (
  listener: HandoffListener
): (() => void) => {
  handoffListeners.add(listener);
  return () => {
    handoffListeners.delete(listener);
  };
};
