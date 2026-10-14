import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LMS_LAUNCH_SESSION_KEY,
  LMS_LAUNCH_SYNC_LOCK_KEY,
  beginLmsLaunchSession,
  clearLmsLaunchSession,
  clearLmsLaunchStorage,
  finishLmsLaunchSession,
  isLmsLaunchSyncPending,
  resetLmsLaunchSyncStateForTests,
  runLtiLaunchSyncIfNeeded,
} from '../../../src/utils/lmsLaunchSync';

const syncLmsClasses = vi.fn(() => ({ type: 'syncLmsClasses' }));

vi.mock('../../../src/redux/lms/SyncLmsClassesRedux', () => ({
  syncLmsClasses: (...args: unknown[]) => syncLmsClasses(...args),
}));

describe('lmsLaunchSync', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetLmsLaunchSyncStateForTests();
    syncLmsClasses.mockReset();
  });

  it('isLmsLaunchSyncPending is false when session flag missing', () => {
    expect(isLmsLaunchSyncPending()).toBe(false);
  });

  it('beginLmsLaunchSession sets pending flag and clears stale lock', () => {
    sessionStorage.setItem(LMS_LAUNCH_SYNC_LOCK_KEY, '1');
    beginLmsLaunchSession();
    expect(isLmsLaunchSyncPending()).toBe(true);
    expect(sessionStorage.getItem(LMS_LAUNCH_SYNC_LOCK_KEY)).toBeNull();
  });

  it('clearLmsLaunchSession removes session and lock keys', () => {
    sessionStorage.setItem(LMS_LAUNCH_SESSION_KEY, '1');
    sessionStorage.setItem(LMS_LAUNCH_SYNC_LOCK_KEY, '1');
    clearLmsLaunchSession();
    expect(sessionStorage.getItem(LMS_LAUNCH_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(LMS_LAUNCH_SYNC_LOCK_KEY)).toBeNull();
  });

  it('clearLmsLaunchStorage removes persisted launch keys but keeps session flag', () => {
    sessionStorage.setItem(LMS_LAUNCH_SESSION_KEY, '1');
    localStorage.setItem('lti_school_id', 'school-b');
    localStorage.setItem('lti_course_id', '42');
    localStorage.setItem('nrpsUrl', 'https://moodle.example/nrps');
    clearLmsLaunchStorage();
    expect(localStorage.getItem('lti_school_id')).toBeNull();
    expect(localStorage.getItem('lti_course_id')).toBeNull();
    expect(localStorage.getItem('nrpsUrl')).toBeNull();
    expect(sessionStorage.getItem(LMS_LAUNCH_SESSION_KEY)).toBe('1');
  });

  it('runLtiLaunchSyncIfNeeded runs sync once while session is pending', async () => {
    beginLmsLaunchSession();
    const dispatch = vi.fn(() => ({
      unwrap: () =>
        Promise.resolve({ created: 0, skipped: 1, createdClassNames: [] }),
    }));

    const ran = await runLtiLaunchSyncIfNeeded(dispatch);

    expect(ran).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(isLmsLaunchSyncPending()).toBe(true);
  });

  it('runLtiLaunchSyncIfNeeded skips when session flag already cleared', async () => {
    const dispatch = vi.fn();
    const ran = await runLtiLaunchSyncIfNeeded(dispatch);
    expect(ran).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('runLtiLaunchSyncIfNeeded skips when sync lock is held by another caller', async () => {
    beginLmsLaunchSession();
    sessionStorage.setItem(LMS_LAUNCH_SYNC_LOCK_KEY, '1');

    const dispatch = vi.fn(() => ({
      unwrap: () =>
        Promise.resolve({
          created: 1,
          skipped: 0,
          createdClassNames: ['Clinical skills - demo'],
        }),
    }));
    const ran = await runLtiLaunchSyncIfNeeded(dispatch);

    expect(ran).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('runLtiLaunchSyncIfNeeded shares one in-flight promise across callers', async () => {
    beginLmsLaunchSession();
    let resolveSync: ((value: unknown) => void) | undefined;
    const dispatch = vi.fn(() => ({
      unwrap: () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    }));

    const first = runLtiLaunchSyncIfNeeded(dispatch);
    const second = runLtiLaunchSyncIfNeeded(dispatch);

    expect(first).toBe(second);
    resolveSync?.({ created: 0, skipped: 1, createdClassNames: [] });

    await expect(first).resolves.toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('finishLmsLaunchSession clears pending session flag', async () => {
    beginLmsLaunchSession();
    localStorage.setItem('lti_school_id', 'school-b');
    const dispatch = vi.fn(() => ({
      unwrap: () =>
        Promise.resolve({ created: 0, skipped: 1, createdClassNames: [] }),
    }));

    await runLtiLaunchSyncIfNeeded(dispatch);
    finishLmsLaunchSession();

    expect(isLmsLaunchSyncPending()).toBe(false);
    expect(localStorage.getItem('lti_school_id')).toBe('school-b');
  });

  it('runLtiLaunchSyncIfNeeded releases lock on failure', async () => {
    beginLmsLaunchSession();
    const dispatch = vi.fn(() => ({
      unwrap: () => Promise.reject(new Error('sync failed')),
    }));

    await expect(runLtiLaunchSyncIfNeeded(dispatch)).rejects.toThrow(
      'sync failed'
    );
    expect(isLmsLaunchSyncPending()).toBe(true);
    expect(sessionStorage.getItem(LMS_LAUNCH_SYNC_LOCK_KEY)).toBeNull();
  });
});
