import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resyncGoogleClassroomRostersIfConfigured,
  resetGoogleClassroomRosterSyncStateForTests,
} from '../../../src/utils/googleClassroomRosterSync';

const getParsedUser = vi.fn();
const fetchGoogleClassroomConnection = vi.fn();
const fetchGoogleClassroomCourses = vi.fn();
const syncGoogleClassroomRoster = vi.fn();

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: (...args: unknown[]) => getParsedUser(...args),
}));

vi.mock('../../../src/redux/lms/GoogleClassroomRedux', () => ({
  fetchGoogleClassroomConnection: (...args: unknown[]) =>
    fetchGoogleClassroomConnection(...args),
  fetchGoogleClassroomCourses: (...args: unknown[]) =>
    fetchGoogleClassroomCourses(...args),
  syncGoogleClassroomRoster: (...args: unknown[]) =>
    syncGoogleClassroomRoster(...args),
}));

function mockDispatch() {
  return vi.fn((action: unknown) => {
    const thunk = action as { unwrap?: () => Promise<unknown> };
    return {
      unwrap: () =>
        thunk?.unwrap ? thunk.unwrap() : Promise.resolve(undefined),
    };
  });
}

describe('resyncGoogleClassroomRostersIfConfigured', () => {
  beforeEach(() => {
    resetGoogleClassroomRosterSyncStateForTests();
    getParsedUser.mockReset();
    fetchGoogleClassroomConnection.mockReset();
    fetchGoogleClassroomCourses.mockReset();
    syncGoogleClassroomRoster.mockReset();
  });

  it('skips when google_classroom_enabled is false', async () => {
    getParsedUser.mockReturnValue({
      google_classroom_enabled: false,
      school_id: 'school-1',
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips when not connected', async () => {
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: false,
          status: null,
        }),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(fetchGoogleClassroomCourses).not.toHaveBeenCalled();
    expect(syncGoogleClassroomRoster).not.toHaveBeenCalled();
  });

  it('syncs linked mappings when connected', async () => {
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: true,
          status: 'active',
        }),
    });
    fetchGoogleClassroomCourses.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { linked: true, mappingId: 'map-1' },
          { linked: false, mappingId: 'map-2' },
          { linked: true, mappingId: 'map-3' },
        ]),
    });
    syncGoogleClassroomRoster.mockReturnValue({
      unwrap: () => Promise.resolve({ mappingId: 'ok' }),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(2);
    expect(syncGoogleClassroomRoster).toHaveBeenCalledTimes(2);
    expect(syncGoogleClassroomRoster).toHaveBeenCalledWith({
      schoolId: 'school-1',
      mappingId: 'map-1',
    });
    expect(syncGoogleClassroomRoster).toHaveBeenCalledWith({
      schoolId: 'school-1',
      mappingId: 'map-3',
    });
  });

  it('shares one in-flight promise across callers', async () => {
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    let resolveConnection: ((value: unknown) => void) | undefined;
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    });
    fetchGoogleClassroomCourses.mockReturnValue({
      unwrap: () => Promise.resolve([]),
    });
    const dispatch = mockDispatch();

    const first = resyncGoogleClassroomRostersIfConfigured(dispatch);
    const second = resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(first).toBe(second);
    resolveConnection?.({ connected: false, status: null });
    await expect(first).resolves.toBe(0);
    await expect(second).resolves.toBe(0);
    expect(fetchGoogleClassroomConnection).toHaveBeenCalledTimes(1);
  });

  it('does not resync non-GC schools when only the top-level flag is true', async () => {
    getParsedUser.mockReturnValue({
      google_classroom_enabled: true,
      school: { id: 'school-1', google_classroom_enabled: false },
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(fetchGoogleClassroomConnection).not.toHaveBeenCalled();
  });

  it('only resyncs GC-enabled schools for multi-school educators', async () => {
    getParsedUser.mockReturnValue({
      schools: [
        { id: 'school-primary', google_classroom_enabled: false },
        { id: 'school-gc', google_classroom_enabled: true },
      ],
      school: { id: 'school-primary', google_classroom_enabled: false },
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: false,
          status: null,
        }),
    });
    const dispatch = mockDispatch();

    await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(fetchGoogleClassroomConnection).toHaveBeenCalledTimes(1);
    expect(fetchGoogleClassroomConnection).toHaveBeenCalledWith({
      schoolId: 'school-gc',
    });
  });

  it('syncs when a secondary assigned school has GC enabled', async () => {
    getParsedUser.mockReturnValue({
      google_classroom_enabled: false,
      schools: [
        { id: 'school-primary', google_classroom_enabled: false },
        { id: 'school-gc', google_classroom_enabled: true },
      ],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: false,
          status: null,
        }),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(fetchGoogleClassroomConnection).toHaveBeenCalled();
  });

  it('returns 0 when connection fetch fails', async () => {
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () => Promise.reject(new Error('connection failed')),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(fetchGoogleClassroomCourses).not.toHaveBeenCalled();
    expect(syncGoogleClassroomRoster).not.toHaveBeenCalled();
  });

  it('returns 0 when courses fetch fails', async () => {
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: true,
          status: 'active',
        }),
    });
    fetchGoogleClassroomCourses.mockReturnValue({
      unwrap: () => Promise.reject(new Error('courses failed')),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(syncGoogleClassroomRoster).not.toHaveBeenCalled();
  });

  it('counts only successful syncs when one mapping fails mid-batch', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: true,
          status: 'active',
        }),
    });
    fetchGoogleClassroomCourses.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { linked: true, mappingId: 'map-ok' },
          { linked: true, mappingId: 'map-fail' },
        ]),
    });
    syncGoogleClassroomRoster.mockImplementation(
      ({ mappingId }: { mappingId: string }) => ({
        unwrap: () =>
          mappingId === 'map-fail'
            ? Promise.reject(
                'Google Classroom authorization expired or was revoked. Reconnect Google Classroom for this school.'
              )
            : Promise.resolve({ mappingId, lastRosterSyncedAt: '2026-01-01' }),
      })
    );
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(1);
    expect(syncGoogleClassroomRoster).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toMatch(
      /roster sync failed|authorization expired/i
    );
    warnSpy.mockRestore();
  });

  it('logs and continues when sync rejects with REAUTH_REQUIRED', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getParsedUser.mockReturnValue({
      schools: [{ id: 'school-1', google_classroom_enabled: true }],
    });
    fetchGoogleClassroomConnection.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          connected: true,
          status: 'active',
        }),
    });
    fetchGoogleClassroomCourses.mockReturnValue({
      unwrap: () => Promise.resolve([{ linked: true, mappingId: 'map-1' }]),
    });
    syncGoogleClassroomRoster.mockReturnValue({
      unwrap: () =>
        Promise.reject(
          'Google Classroom authorization expired or was revoked. Reconnect Google Classroom for this school.'
        ),
    });
    const dispatch = mockDispatch();

    const synced = await resyncGoogleClassroomRostersIfConfigured(dispatch);

    expect(synced).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GoogleClassroomRosterSync]')
    );
    warnSpy.mockRestore();
  });
});
