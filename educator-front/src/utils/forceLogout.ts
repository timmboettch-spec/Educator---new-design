/**
 * Centralized force-logout utility.
 *
 * This is the single source of truth for all forced-logout scenarios:
 *  - WebSocket events  (school_inactivated, account-deleted, etc.)
 *  - Axios interceptor (401 / 403 / body-level auth errors)
 *  - Periodic status polling
 *
 * Intentionally avoids React Router's `navigate` so it can be called from
 * any module — axios interceptors, WebSocket callbacks, plain utilities —
 * without needing React context.  A hard `window.location.replace` is used
 * instead, which also guarantees all in-memory JS state is cleared.
 */

import { clearAuthData } from './storage';
import { logout } from '../redux/auth/LoginRedux';
import { SESSION_TOAST_KEY } from '../components/common/Toast';
import { store } from '../store';

// ---------------------------------------------------------------------------
// WebSocket disconnect registry
// ---------------------------------------------------------------------------
// The active socket's disconnect function is registered here when the socket
// is created.  forceLogout calls it to cleanly close the socket before
// clearing credentials.

type DisconnectFn = () => void;
let _socketDisconnect: DisconnectFn | null = null;

/** Register the active socket's disconnect function. Call when socket opens. */
export function registerSocketDisconnect(fn: DisconnectFn): void {
  _socketDisconnect = fn;
}

/** Unregister. Call in useEffect cleanup / when a socket is torn down. */
export function unregisterSocketDisconnect(): void {
  _socketDisconnect = null;
}

// ---------------------------------------------------------------------------
// Canonical toast messages
// ---------------------------------------------------------------------------

export const LOGOUT_MESSAGES = {
  /** New backend event: school marked inactive */
  SCHOOL_INACTIVE:
    'Your school has been marked as inactive. Please contact your administrator.',
  /** Legacy / broader school deactivation message */
  SCHOOL_DEACTIVATED:
    'Your school has been deactivated. Educator login, classes, and student codes are currently unavailable. Please contact your administrator.',
  ACCOUNT_DELETED:
    'Your account has been removed. Please contact your administrator.',
  ACCOUNT_DEACTIVATED:
    'Your account has been deactivated. Please contact your administrator.',
  SESSION_EXPIRED:
    'Your session has expired. Please log in again.',
} as const;

// ---------------------------------------------------------------------------
// Re-entrancy guard
// ---------------------------------------------------------------------------
// Prevents duplicate logout calls when, for example, a WebSocket event and
// a 401 response fire at nearly the same time.

let _isLoggingOut = false;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Immediately log out the current user.
 *
 * Execution order:
 *  1. Disconnect the active WebSocket (if registered)
 *  2. Clear all auth cookies / sessionStorage keys
 *  3. Reset the Redux auth slice
 *  4. Queue a toast message for the login page
 *  5. Hard-redirect to /login  (replaces history so back-button won't return)
 */
export function forceLogout(message: string = LOGOUT_MESSAGES.SESSION_EXPIRED): void {
  // Already on the login page or mid-logout — do nothing
  if (_isLoggingOut || window.location.pathname === '/login') return;
  _isLoggingOut = true;

  // 1. Close WebSocket cleanly
  try {
    _socketDisconnect?.();
  } catch { /* ignore */ }
  _socketDisconnect = null;

  // 2. Wipe all persisted auth data (cookies + sessionStorage keys)
  clearAuthData();

  // 3. Reset Redux login slice so any in-flight selectors see a logged-out state
  try {
    store.dispatch(logout());
  } catch { /* ignore */ }

  // 4. Store the toast so AppRouter can show it after the redirect
  try {
    sessionStorage.setItem(
      SESSION_TOAST_KEY,
      JSON.stringify({ type: 'error', message }),
    );
  } catch { /* ignore */ }

  // 5. Hard navigate — guarantees all React state is torn down on reload
  window.location.replace('/login');
}
