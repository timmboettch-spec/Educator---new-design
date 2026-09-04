import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../store/hooks';
import { restoreSession, markSessionChecked } from '../redux/auth/LoginRedux';
import { markSessionReady } from '../utils/sessionState';
import {
  getToken,
  getParsedUser,
  isRememberMe,
  isSessionActive,
  isSessionCookieActive,
  markTabSessionActive,
  clearAuthData,
  updateStoredUser,
} from '../utils/storage';
import api from '../redux/api';
import config from '../redux/config';

function createChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  return new BroadcastChannel('auth_session');
}

/**
 * Fetch the educator's live profile from the backend and merge the mutable
 * fields (schools, status) into the in-memory user object AND the auth cookie.
 *
 * This runs BEFORE restoreSession() is dispatched so that the very first Redux
 * state — and every component's first render — sees up-to-date data.
 *
 * Returns the merged user object.  Falls back to the original cookie user when
 * the network request fails so that offline / transient errors don't break the
 * session restore.
 */
async function syncProfileFromServer(
  user: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Only educators have school assignments and status that change dynamically.
  const rawRole = user['role'];
  const roleName = (
    typeof rawRole === 'string'
      ? rawRole
      : (rawRole as { role_name?: string } | null)?.role_name ?? ''
  ).toLowerCase();
  if (roleName !== 'educator') return user;

  try {
    const res = await api.get(`${config.GetEducatorAPI}/profile`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    const profile = (res.data?.data ?? res.data) as Record<string, unknown> | undefined;
    if (!profile) return user;

    // Merge only the fields that can change without re-issuing a JWT.
    const updates: Record<string, unknown> = {};
    if (Array.isArray(profile['schools'])) updates['schools'] = profile['schools'];
    if (typeof profile['status'] === 'string') updates['status'] = profile['status'];
    if (typeof profile['tokens'] === 'number') updates['tokens'] = profile['tokens'];
    if (typeof profile['full_name'] === 'string') updates['full_name'] = profile['full_name'];
    if (typeof profile['profile_picture'] === 'string' || profile['profile_picture'] === null) {
      updates['profile_picture'] = profile['profile_picture'];
    }

    if (Object.keys(updates).length === 0) return user;

    // Persist the fresh values into the auth cookie so getParsedUser()
    // callers (class page, etc.) also see correct data on first read.
    updateStoredUser(updates);

    return { ...user, ...updates };
  } catch {
    // Non-fatal — fall back to the stale cookie user rather than blocking.
    return user;
  }
}

export default function SessionRestorer() {
  const dispatch = useAppDispatch();
  // Persists across StrictMode's unmount/remount so the restore only runs once.
  const hasRestoredRef = useRef(false);

  // Respond to session_ping messages from other tabs so they can confirm this
  // tab has an active session.  The check uses isSessionActive() (sessionStorage)
  // because a tab that is already running will always have that flag set.
  useEffect(() => {
    const channel = createChannel();
    if (!channel) return;

    channel.onmessage = (e: MessageEvent<string>) => {
      if (e.data === 'session_ping' && isSessionActive()) {
        channel.postMessage('session_alive');
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    // Guard against StrictMode's double-invocation: the ref persists across the
    // unmount/remount cycle, so the second mount finds it true and skips.
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restore = async () => {
      const token = getToken();
      const user = getParsedUser();

      // No credentials at all — nothing to restore.
      if (!token || !user) {
        if (token || user) {
          // Partial state (one present, other missing) — wipe to stay consistent.
          clearAuthData();
        }
        await dispatch(markSessionChecked());
        markSessionReady();
        return;
      }

      // Fetch fresh profile data and merge it into the user BEFORE building
      // the restore payload.  This guarantees that the first Redux state and
      // the first cookie read both reflect the server's current truth.
      const freshUser = await syncProfileFromServer(user);

      const buildPayload = () => ({
        data: {
          tokens: {
            accessToken: token,
          },
          user: freshUser,
        },
        message: '',
        status: 'success',
      });

      const persistent = isRememberMe();          // "Remember Me" cookie
      const sameTab    = isSessionActive();        // sessionStorage flag (same tab, pre-refresh)
      const sameBrowser = isSessionCookieActive(); // session cookie (survives refresh, dies on browser close)

      // Fast path: any of the three signals confirms a legitimate session.
      //   - persistent   → user checked "Remember Me"
      //   - sameTab      → sessionStorage still set (same tab, no refresh yet)
      //   - sameBrowser  → session cookie present (same browser, survived refresh)
      if (persistent || sameTab || sameBrowser) {
        // Re-stamp sessionStorage so subsequent in-tab navigation keeps sameTab=true.
        markTabSessionActive();
        try {
          await dispatch(restoreSession(buildPayload()));
        } catch {
          clearAuthData();
          await dispatch(markSessionChecked());
        } finally {
          markSessionReady();
        }
        return;
      }

      // Slow path: token + user cookies exist but none of the session signals are
      // set.  This happens when a user manually opens a new tab by pasting a URL
      // (not Ctrl+T from an existing tab) or after the browser was fully closed
      // and reopened without "Remember Me".  Use BroadcastChannel to ask other
      // open tabs whether a session is alive.
      const channel = createChannel();

      if (!channel) {
        // BroadcastChannel unavailable — cannot verify; clear to be safe.
        clearAuthData();
        await dispatch(markSessionChecked());
        markSessionReady();
        return;
      }

      let settled = false;

      const settle = async (alive: boolean) => {
        if (settled) return;
        settled = true;
        channel.close();

        if (alive) {
          markTabSessionActive();
          try {
            await dispatch(restoreSession(buildPayload()));
          } catch {
            clearAuthData();
            await dispatch(markSessionChecked());
          } finally {
            markSessionReady();
          }
        } else {
          clearAuthData();
          await dispatch(markSessionChecked());
          markSessionReady();
        }
      };

      channel.onmessage = (e: MessageEvent<string>) => {
        if (e.data === 'session_alive') {
          void settle(true);
        }
      };

      channel.postMessage('session_ping');

      setTimeout(() => {
        void settle(false);
      }, 300);
    };

    void restore();
  }, [dispatch]);

  return null;
}

