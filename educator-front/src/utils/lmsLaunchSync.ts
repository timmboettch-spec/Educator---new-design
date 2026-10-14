import type { AppDispatch } from '../store';
import {
  resyncLmsRosters,
  syncLmsClasses,
} from '../redux/lms/SyncLmsClassesRedux';

export const LMS_LAUNCH_SESSION_KEY = 'lms_launch_session';
export const LMS_LAUNCH_SYNC_LOCK_KEY = 'lms_launch_sync_lock';

const LTI_LAUNCH_STORAGE_KEYS = [
  'lti_school_id',
  'lti_course_id',
  'lti_course_name',
  'nrpsUrl',
  // No longer written; kept so logout/launch purges tokens left by older builds.
  'lmsAccessToken',
  'moodleAccessToken',
  'moodle_access_token',
] as const;

/** Clears persisted LTI/LMS launch context from localStorage (call on logout). */
export function clearLmsLaunchStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  for (const key of LTI_LAUNCH_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

function hasLmsContextInStorage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const nrpsUrl = (localStorage.getItem('nrpsUrl') ?? '').trim();
  const ltiCourseId = (localStorage.getItem('lti_course_id') ?? '').trim();
  return Boolean(nrpsUrl || ltiCourseId);
}

export function getLtiSchoolIdFromStorage(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return (localStorage.getItem('lti_school_id') ?? '').trim();
}

export function isLmsLaunchSyncPending(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(LMS_LAUNCH_SESSION_KEY) === '1';
}

export function beginLmsLaunchSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(LMS_LAUNCH_SYNC_LOCK_KEY);
  sessionStorage.setItem(LMS_LAUNCH_SESSION_KEY, '1');
  launchSyncPromise = null;
}

export function clearLmsLaunchSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(LMS_LAUNCH_SESSION_KEY);
  sessionStorage.removeItem(LMS_LAUNCH_SYNC_LOCK_KEY);
}

function tryAcquireSyncLock(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (sessionStorage.getItem(LMS_LAUNCH_SYNC_LOCK_KEY) === '1') {
    return false;
  }
  sessionStorage.setItem(LMS_LAUNCH_SYNC_LOCK_KEY, '1');
  return true;
}

function releaseSyncLock(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(LMS_LAUNCH_SYNC_LOCK_KEY);
}

/** Cached launch sync for this page load; cleared on the next LTI launch. */
let launchSyncPromise: Promise<boolean> | null = null;
let inFlightResync: Promise<number> | null = null;

/** @internal Resets module state between unit tests. */
export function resetLmsLaunchSyncStateForTests(): void {
  launchSyncPromise = null;
  inFlightResync = null;
}

/**
 * Runs LMS sync at most once per LTI launch (until session flag is cleared).
 * Creates new mapped classes when needed, then triggers backend roster sync.
 * Concurrent callers (e.g. React StrictMode double-mount) share one in-flight promise.
 */
export function runLtiLaunchSyncIfNeeded(
  dispatch: AppDispatch
): Promise<boolean> {
  if (launchSyncPromise) {
    return launchSyncPromise;
  }
  if (!isLmsLaunchSyncPending()) {
    return Promise.resolve(false);
  }

  launchSyncPromise = (async (): Promise<boolean> => {
    if (!tryAcquireSyncLock()) {
      // Another caller holds the lock — do not force-release; share outcome via launchSyncPromise.
      return false;
    }
    try {
      await dispatch(syncLmsClasses()).unwrap();
      return true;
    } catch (error) {
      releaseSyncLock();
      launchSyncPromise = null;
      throw error;
    }
  })();

  return launchSyncPromise;
}

/** Call after dashboard/class list has loaded following a launch sync attempt. */
export function finishLmsLaunchSession(): void {
  clearLmsLaunchSession();
}

/**
 * Re-syncs Moodle rosters for all mapped classes (add/remove students in DB).
 * Safe to call on dashboard/classes refresh — not limited to one LTI launch.
 */
export function resyncLmsRostersIfConfigured(
  dispatch: AppDispatch
): Promise<number> {
  if (!hasLmsContextInStorage()) {
    return Promise.resolve(0);
  }
  if (inFlightResync) {
    return inFlightResync;
  }

  const resyncPromise = dispatch(resyncLmsRosters())
    .unwrap()
    .then((result) => result.resynced)
    .catch(() => 0);

  inFlightResync = resyncPromise.finally(() => {
    inFlightResync = null;
  });

  return inFlightResync;
}
