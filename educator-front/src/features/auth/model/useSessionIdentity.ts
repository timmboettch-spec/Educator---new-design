import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import {
  selectLoginResponse,
  selectSessionChecked,
} from '../../../redux/auth/LoginRedux';
import { selectSignUpResponse } from '../../../redux/auth/SignUpRedux';
import { useAppSelector } from '../../../store/hooks';
import { isGoogleClassroomEnabledForStoredUser } from '../../../utils/googleClassroomAccess';
import {
  isLtiSessionHandoff,
  subscribeLtiSessionHandoff,
} from '../../../utils/sessionState';
import { getParsedUser, getToken } from '../../../utils/storage';
import {
  hasSkippedRedeem,
  subscribeRedeemSkipped,
} from '../../../utils/trialState';
import type { AccessContext } from '../access/types';
import { coerceRole, type RoleSlug } from './roles';
import {
  hasResolutionDeadlinePassed,
  restartResolutionDeadline,
  subscribeResolutionDeadline,
} from './sessionResolution';

/**
 * What the navigation derivation needs on top of the raw access facts: the feature
 * flags a route may be gated on.
 */
export type SessionIdentity = AccessContext & {
  googleClassroomEnabled: boolean;
  /**
   * The raw access token backing this session, or null.
   *
   * Not part of `AccessContext` — no access *decision* is allowed to depend on it.
   * It is exposed because the account-status socket authenticates with it and needs
   * the same source-of-truth chain (Redux login → Redux signup → cookie) that
   * `isAuthenticated` is derived from, rather than a second copy of it.
   */
  accessToken: string | null;
  /**
   * The signed-in user's id, or null. Like `accessToken`, not part of
   * `AccessContext` — no access decision may depend on it. Exposed for per-user
   * client caches (e.g. the setup guide's hidden flag) so they read the same
   * session chain instead of parsing the cookie themselves.
   */
  userId: string | null;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

/** Storage access throws in a blocked third-party iframe rather than returning null. */
const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

/**
 * The active role, resolved from whichever of three shapes this session happens to
 * carry. Ordered most to least authoritative, and it stops at the first that answers.
 *
 * Link 3 is not a legacy courtesy: `useLtiLaunchHandler` stores the session-exchange
 * payload without running it through `normalizeAuthUser`, so an instructor arriving
 * from Canvas has neither of the first two fields and resolves entirely on the
 * display name.
 */
const resolveRoleSlug = (user: UnknownRecord | null): RoleSlug | null => {
  if (!user) return null;

  // 1 — written by normalizeAuthUser on every login, invite accept and role switch.
  const direct = coerceRole(user['active_role_slug']);
  if (direct) return direct;

  // 2 — sessions stored before `active_role_slug` existed still carry both of these.
  const activeRoleId = user['active_role_id'];
  const availableRoles = user['available_roles'];
  if (typeof activeRoleId === 'string' && Array.isArray(availableRoles)) {
    const match = (availableRoles as UnknownRecord[]).find(
      (role) => asRecord(role)?.['id'] === activeRoleId
    );
    const fromList = coerceRole(match?.['slug']);
    if (fromList) return fromList;
  }

  // 3 — the display name, or the older `{ role_name }` object.
  return coerceRole(user['role']);
};

/** `normalizeAuthUser` stores `userId ?? id` under `id`; raw BE users use `userId`. */
const resolveUserId = (user: UnknownRecord | null): string | null => {
  const id = user?.['id'] ?? user?.['userId'];
  return typeof id === 'string' && id ? id : null;
};

/** GC tab when any assigned school has the feature enabled (cookie + Redux must agree). */
const resolveGoogleClassroom = (
  reduxUser: UnknownRecord | null,
  cookieUser: UnknownRecord | null
): boolean =>
  isGoogleClassroomEnabledForStoredUser(reduxUser) &&
  isGoogleClassroomEnabledForStoredUser(cookieUser);

/**
 * The single reactive read of "who am I", and the only sanctioned way anything outside
 * this feature learns the active role.
 *
 * Reads the **store** first rather than storage. That is load-bearing: switching role
 * rewrites the cookie *and* dispatches `restoreSession`, but a value memoised on a
 * cookie read would never re-run, leaving every guard and the sidebar showing the
 * previous role until a full page reload. The cookie is a first-paint cache, consulted
 * only when Redux has nothing yet.
 *
 * The signup response *is* a source here, unlike the login response alone. Signup
 * auto-authenticates — it returns the login shape, tokens included — but never calls
 * `setAuthData`, so `getToken()` is empty afterwards and Redux is the only evidence a
 * session exists. Dropping it would strand a newly registered admin on `/login`
 * instead of sending them to `/redeem`, which is the flow `RedeemHeader` serves.
 */
export const useSessionIdentity = (): SessionIdentity => {
  const loginResponse = useAppSelector(selectLoginResponse);
  const signUpResponse = useAppSelector(selectSignUpResponse);
  const sessionChecked = useAppSelector(selectSessionChecked);
  const location = useLocation();

  const ltiHandoff = useSyncExternalStore(
    subscribeLtiSessionHandoff,
    isLtiSessionHandoff,
    () => false
  );
  const skippedRedeem = useSyncExternalStore(
    subscribeRedeemSkipped,
    hasSkippedRedeem,
    () => false
  );
  const deadlinePassed = useSyncExternalStore(
    subscribeResolutionDeadline,
    hasResolutionDeadlinePassed,
    () => false
  );

  /**
   * An LTI launch is mid-flight: the backend has redirected back with a one-time code
   * and the portal session is being swapped underneath us. Any redirect now drops
   * `?lti_launch=success&code=…` from the URL, and `useLtiLaunchHandler` keys its
   * effect on that search string — so the code is never exchanged and the launch dies
   * silently. The URL parameter is checked as well as the flag because the flag is
   * raised in an effect, one render too late to help.
   */
  const ltiLaunchParam = new URLSearchParams(location.search).get('lti_launch');
  const suppressAuthRouting = ltiHandoff || ltiLaunchParam === 'success';

  /**
   * Re-arms the 8s deadline on the rising edge of `suppressAuthRouting` — a new
   * handoff cycle starting. Without this, `hasResolutionDeadlinePassed()` is a
   * one-shot flag for the tab's whole lifetime: once true, it never resets, so a
   * handoff beginning any time after the first 8s of the tab's life (i.e. nearly
   * always, in practice) would read as "deadline already passed" immediately,
   * letting a guard treat the session as resolved while this exact handoff is
   * still in flight — see `sessionResolution.ts`'s `restartResolutionDeadline`.
   *
   * Guarded by a ref rather than firing on every render while suppressed, or the
   * deadline would be perpetually restarted and never get to fire at all.
   */
  const wasSuppressed = useRef(false);
  useEffect(() => {
    if (suppressAuthRouting && !wasSuppressed.current) {
      restartResolutionDeadline();
    }
    wasSuppressed.current = suppressAuthRouting;
  }, [suppressAuthRouting]);

  const token =
    loginResponse?.data?.tokens?.accessToken ??
    signUpResponse?.data?.tokens?.accessToken ??
    safely(() => getToken(), null);

  const cookieUser = safely(() => asRecord(getParsedUser()), null);

  const rawUser =
    asRecord(loginResponse?.data?.user) ??
    asRecord(signUpResponse?.data?.user) ??
    cookieUser;

  /**
   * Everything below is reduced to primitives *before* the memo, and the memo depends
   * on those rather than on the user objects.
   *
   * `getParsedUser()` parses the cookie afresh on every call, so it hands back a new
   * object identity each render even when nothing about the session moved. Keying the
   * memo on that object would defeat it entirely, and the identity is consumed by
   * every guard and by the sidebar's own `useMemo` — all of which would then recompute
   * on every render of every page.
   */
  const role = resolveRoleSlug(rawUser);
  const isAuthenticated = !!token && token !== 'undefined' && token !== 'null';
  const isLicenseActive = !!(
    rawUser?.['is_license_active'] ?? rawUser?.['isLicenseActive']
  );
  const googleClassroomEnabled = resolveGoogleClassroom(rawUser, cookieUser);
  /**
   * The third state. Guards render a loader rather than deny while this is false,
   * because treating "still resolving" as "denied" bounces everyone to login on a hard
   * refresh. Suppressed during an LTI handoff so guards decide *nothing* while the
   * session is being swapped — safer than the old approach of forcing `isAuthenticated`
   * false, which still let a redirect fire underneath the loader.
   *
   * `deadlinePassed` deliberately sits *outside* that suppression rather than being
   * ANDed with it. The deadline exists to bound an unknown hang (see
   * `sessionResolution.ts`), and a handoff that never completes — a slow or wedged LMS
   * callback — is exactly such a hang. Letting `suppressAuthRouting` cancel the
   * deadline out would leave the app blank indefinitely whenever the one case the
   * deadline is meant to catch coincides with the one case that also suppresses it.
   * This only bounds *this* handoff and not a stale one from earlier in the tab's
   * life because the effect above restarts the deadline each time a new handoff
   * begins.
   */
  const isResolved = deadlinePassed || (sessionChecked && !suppressAuthRouting);
  const accessToken = isAuthenticated ? token : null;
  const userId = isAuthenticated ? resolveUserId(rawUser) : null;

  return useMemo(
    () => ({
      role,
      isLicenseActive,
      skippedRedeem,
      isAuthenticated,
      isResolved,
      googleClassroomEnabled,
      accessToken,
      userId,
    }),
    [
      role,
      isLicenseActive,
      skippedRedeem,
      isAuthenticated,
      isResolved,
      googleClassroomEnabled,
      accessToken,
      userId,
    ]
  );
};
