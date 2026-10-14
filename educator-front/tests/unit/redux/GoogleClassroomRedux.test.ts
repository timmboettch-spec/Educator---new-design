import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
  },
}));

vi.mock('../../../src/redux/config', () => ({
  default: {
    GoogleClassroomConnectionAPI: 'http://localhost:3000/api/google/schools',
    ClassUserAPI: 'http://localhost:3000/api/classes/user',
  },
}));

import googleClassroomReducer, {
  disconnectGoogleClassroom,
  fetchArchivedGoogleClasses,
  fetchGoogleClassroomConnection,
  fetchGoogleClassroomCourses,
  initiateGoogleClassroomConnect,
  isAllowedGoogleAuthorizationUrl,
  linkGoogleClassroomCourse,
  provisionGoogleClassroomCourses,
  syncGoogleClassroomRoster,
  unlinkGoogleClassroomCourse,
} from '../../../src/redux/lms/GoogleClassroomRedux';

const connectedStatus = {
  connected: true,
  schoolId: 'school-1',
  status: 'active' as const,
  googleAccountEmail: 'teacher@example.com',
  googleAccountId: 'g-1',
  scopes: 'classroom.courses.readonly',
  tokenExpiresAt: null,
  connectedByEducatorId: 'edu-1',
};

function makeStore() {
  return configureStore({
    reducer: { GoogleClassroom: googleClassroomReducer },
  });
}

describe('isAllowedGoogleAuthorizationUrl', () => {
  it('allows https accounts.google.com authorize URLs', () => {
    expect(
      isAllowedGoogleAuthorizationUrl(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc'
      )
    ).toBe(true);
  });

  it('rejects non-Google hosts even over https', () => {
    expect(
      isAllowedGoogleAuthorizationUrl('https://evil.example.com/oauth')
    ).toBe(false);
  });

  it('rejects http Google hosts', () => {
    expect(
      isAllowedGoogleAuthorizationUrl(
        'http://accounts.google.com/o/oauth2/v2/auth'
      )
    ).toBe(false);
  });

  it('rejects lookalike Google hosts', () => {
    expect(
      isAllowedGoogleAuthorizationUrl(
        'https://accounts.google.com.evil.com/o/oauth2/v2/auth'
      )
    ).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(
      isAllowedGoogleAuthorizationUrl(
        'https://attacker:secret@accounts.google.com/o/oauth2/v2/auth'
      )
    ).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedGoogleAuthorizationUrl('not-a-url')).toBe(false);
  });
});

describe('GoogleClassroomRedux thunks', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiDelete.mockReset();
  });

  it('fetchGoogleClassroomConnection loads connection status', async () => {
    apiGet.mockResolvedValue({ data: { data: connectedStatus } });
    const store = makeStore();

    await store.dispatch(
      fetchGoogleClassroomConnection({ schoolId: 'school-1' })
    );

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/connection'
    );
    expect(store.getState().GoogleClassroom.status).toEqual(connectedStatus);
    expect(store.getState().GoogleClassroom.statusState).toBe('succeeded');
  });

  it('keeps prior status while refreshing the same school', async () => {
    apiGet.mockResolvedValue({ data: { data: connectedStatus } });
    const store = makeStore();
    await store.dispatch(
      fetchGoogleClassroomConnection({ schoolId: 'school-1' })
    );

    let resolveFetch: (value: unknown) => void = () => undefined;
    apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const pending = store.dispatch(
      fetchGoogleClassroomConnection({ schoolId: 'school-1' })
    );
    expect(store.getState().GoogleClassroom.statusState).toBe('loading');
    expect(store.getState().GoogleClassroom.status).toEqual(connectedStatus);

    resolveFetch({
      data: {
        data: { ...connectedStatus, googleAccountEmail: 'new@example.com' },
      },
    });
    await pending;
    expect(store.getState().GoogleClassroom.status?.googleAccountEmail).toBe(
      'new@example.com'
    );
  });

  it('clears status when fetching a different school', async () => {
    apiGet.mockResolvedValue({ data: { data: connectedStatus } });
    const store = makeStore();
    await store.dispatch(
      fetchGoogleClassroomConnection({ schoolId: 'school-1' })
    );

    let resolveFetch: (value: unknown) => void = () => undefined;
    apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const pending = store.dispatch(
      fetchGoogleClassroomConnection({ schoolId: 'school-2' })
    );
    expect(store.getState().GoogleClassroom.status).toBeNull();

    resolveFetch({
      data: {
        data: { ...connectedStatus, schoolId: 'school-2', connected: false },
      },
    });
    await pending;
  });

  it('initiateGoogleClassroomConnect accepts Google authorize URLs', async () => {
    apiPost.mockResolvedValue({
      data: {
        data: {
          authorizationUrl:
            'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
          schoolId: 'school-1',
        },
      },
    });
    const store = makeStore();
    const result = await store.dispatch(
      initiateGoogleClassroomConnect({ schoolId: 'school-1' })
    );

    expect(result.type).toBe('googleClassroom/initiateConnect/fulfilled');
    expect(apiPost).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/connect',
      {}
    );
  });

  it('initiateGoogleClassroomConnect rejects non-Google authorization URLs', async () => {
    apiPost.mockResolvedValue({
      data: {
        data: {
          authorizationUrl: 'https://evil.example.com/phish',
          schoolId: 'school-1',
        },
      },
    });
    const store = makeStore();
    const result = await store.dispatch(
      initiateGoogleClassroomConnect({ schoolId: 'school-1' })
    );

    expect(result.type).toBe('googleClassroom/initiateConnect/rejected');
    expect(result.payload).toBe('Invalid Google authorization URL');
  });

  it('disconnectGoogleClassroom updates status', async () => {
    apiDelete.mockResolvedValue({
      data: {
        data: { ...connectedStatus, connected: false, status: null },
      },
    });
    const store = makeStore();
    await store.dispatch(disconnectGoogleClassroom({ schoolId: 'school-1' }));

    expect(apiDelete).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/connection'
    );
    expect(store.getState().GoogleClassroom.status?.connected).toBe(false);
  });

  it('fetchGoogleClassroomCourses stores the Google course list', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: false,
              mappingId: null,
              classId: null,
            },
          ],
        },
      },
    });
    const store = makeStore();

    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/courses'
    );
    expect(store.getState().GoogleClassroom.courses).toEqual([
      {
        id: 'gc-course-1',
        name: 'Biology',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: null,
        enrollmentState: null,
        alternateLink: null,
        linked: false,
        mappingId: null,
        classId: null,
        className: null,
        archived: false,
        lastRosterSyncedAt: null,
      },
    ]);
    expect(store.getState().GoogleClassroom.coursesState).toBe('succeeded');
  });

  it('fetchGoogleClassroomCourses keeps lastRosterSyncedAt from the API', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: true,
              mappingId: 'map-1',
              classId: 'class-1',
              lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
            },
          ],
        },
      },
    });
    const store = makeStore();

    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    expect(store.getState().GoogleClassroom.courses[0].lastRosterSyncedAt).toBe(
      '2026-09-10T12:00:00.000Z'
    );
  });

  it('provisionGoogleClassroomCourses stores provision items for the link modal', async () => {
    apiPost.mockResolvedValue({
      data: {
        data: {
          schoolId: 'school-1',
          newCount: 0,
          archivedMatchCount: 0,
          items: [
            {
              course: {
                id: 'gc-course-1',
                name: 'Biology',
                section: null,
                descriptionHeading: null,
                room: null,
                courseState: null,
                enrollmentState: null,
                alternateLink: null,
              },
              classId: null,
              className: 'Biology',
              linked: false,
              mappingId: null,
              isNew: false,
              archived: false,
              lastRosterSyncedAt: null,
            },
          ],
        },
      },
    });
    const store = makeStore();

    await store.dispatch(
      provisionGoogleClassroomCourses({ schoolId: 'school-1' })
    );

    expect(apiPost).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/courses/provision',
      {}
    );
    expect(store.getState().GoogleClassroom.provisionResult?.newCount).toBe(0);
    expect(
      store.getState().GoogleClassroom.provisionResult?.items
    ).toHaveLength(1);
    expect(store.getState().GoogleClassroom.provisionState).toBe('succeeded');
  });

  it('fetchArchivedGoogleClasses stores archived Google-origin classes', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          classes: [
            {
              classId: 'class-1',
              className: 'Biology (GC)',
              googleCourseId: 'gc-course-1',
              googleCourseName: 'Biology',
              courseExists: true,
              archivedAt: '2026-09-10T12:00:00.000Z',
            },
          ],
        },
      },
    });
    const store = makeStore();

    await store.dispatch(fetchArchivedGoogleClasses({ schoolId: 'school-1' }));

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/archived-google-classes'
    );
    expect(store.getState().GoogleClassroom.archivedClasses).toEqual([
      {
        classId: 'class-1',
        className: 'Biology (GC)',
        googleCourseId: 'gc-course-1',
        googleCourseName: 'Biology',
        courseExists: true,
        archivedAt: '2026-09-10T12:00:00.000Z',
      },
    ]);
    expect(store.getState().GoogleClassroom.archivedState).toBe('succeeded');
  });

  it('linkGoogleClassroomCourse marks the matching course as linked', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: false,
              mappingId: null,
              classId: null,
            },
          ],
        },
      },
    });
    apiPost.mockResolvedValue({
      data: {
        data: {
          id: 'map-1',
          schoolId: 'school-1',
          classId: 'class-1',
          googleCourseId: 'gc-course-1',
          googleCourseName: 'Biology',
          linkedByEducatorId: 'edu-1',
          createdAt: '2026-09-10T00:00:00.000Z',
          updatedAt: '2026-09-10T00:00:00.000Z',
        },
      },
    });
    const store = makeStore();
    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    await store.dispatch(
      linkGoogleClassroomCourse({
        schoolId: 'school-1',
        googleCourseId: 'gc-course-1',
        googleCourseName: 'Biology',
      })
    );

    expect(apiPost).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/course-mappings',
      {
        googleCourseId: 'gc-course-1',
        googleCourseName: 'Biology',
        googleCourseSection: undefined,
        googleCourseOwnerId: undefined,
      }
    );
    expect(store.getState().GoogleClassroom.courses[0]).toMatchObject({
      linked: true,
      mappingId: 'map-1',
      classId: 'class-1',
    });
    expect(store.getState().GoogleClassroom.linkState).toBe('succeeded');
    expect(store.getState().GoogleClassroom.linkingCourseId).toBeNull();
  });

  it('unlinkGoogleClassroomCourse clears the matching mapping', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: true,
              mappingId: 'map-1',
              classId: 'class-1',
              lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
            },
          ],
        },
      },
    });
    apiDelete.mockResolvedValue({});
    const store = makeStore();
    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    await store.dispatch(
      unlinkGoogleClassroomCourse({ schoolId: 'school-1', mappingId: 'map-1' })
    );

    expect(apiDelete).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/course-mappings/map-1'
    );
    expect(store.getState().GoogleClassroom.courses[0]).toMatchObject({
      linked: false,
      mappingId: null,
      classId: 'class-1',
      archived: true,
      lastRosterSyncedAt: null,
    });
    expect(store.getState().GoogleClassroom.archivedClasses[0]).toMatchObject({
      classId: 'class-1',
      googleCourseId: 'gc-course-1',
      courseExists: true,
    });
    expect(store.getState().GoogleClassroom.unlinkState).toBe('succeeded');
    expect(store.getState().GoogleClassroom.unlinkingMappingId).toBeNull();
  });

  it('syncGoogleClassroomRoster stamps lastRosterSyncedAt on the linked course', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: true,
              mappingId: 'map-1',
              classId: 'class-1',
              lastRosterSyncedAt: null,
            },
          ],
        },
      },
    });
    apiPost.mockResolvedValue({
      data: {
        data: {
          mappingId: 'map-1',
          classId: 'class-1',
          googleCourseId: 'gc-course-1',
          lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
          added: 3,
          updated: 0,
          deactivated: 0,
          total: 3,
        },
      },
    });
    const store = makeStore();
    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    await store.dispatch(
      syncGoogleClassroomRoster({ schoolId: 'school-1', mappingId: 'map-1' })
    );

    expect(apiPost).toHaveBeenCalledWith(
      'http://localhost:3000/api/google/schools/school-1/course-mappings/map-1/sync-roster'
    );
    expect(store.getState().GoogleClassroom.courses[0].lastRosterSyncedAt).toBe(
      '2026-09-10T12:00:00.000Z'
    );
    expect(store.getState().GoogleClassroom.rosterSyncState).toBe('succeeded');
    expect(store.getState().GoogleClassroom.syncingMappingId).toBeNull();
  });

  it('syncGoogleClassroomRoster reject clears the in-flight mapping id', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          courses: [
            {
              id: 'gc-course-1',
              name: 'Biology',
              linked: true,
              mappingId: 'map-1',
              classId: 'class-1',
              lastRosterSyncedAt: null,
            },
          ],
        },
      },
    });
    apiPost.mockRejectedValue({
      response: {
        data: {
          message:
            'Google Classroom authorization expired or was revoked. Reconnect Google Classroom for this school.',
        },
      },
    });
    const store = makeStore();
    await store.dispatch(fetchGoogleClassroomCourses({ schoolId: 'school-1' }));

    const result = await store.dispatch(
      syncGoogleClassroomRoster({ schoolId: 'school-1', mappingId: 'map-1' })
    );

    expect(result.type).toBe('googleClassroom/syncRoster/rejected');
    expect(store.getState().GoogleClassroom.rosterSyncState).toBe('failed');
    expect(store.getState().GoogleClassroom.syncingMappingId).toBeNull();
    expect(store.getState().GoogleClassroom.error).toMatch(
      /reconnect google classroom/i
    );
    expect(
      store.getState().GoogleClassroom.courses[0].lastRosterSyncedAt
    ).toBeNull();
  });

  it('syncGoogleClassroomRoster rejects an empty sync response', async () => {
    apiPost.mockResolvedValue({ data: { data: {} } });
    const store = makeStore();

    const result = await store.dispatch(
      syncGoogleClassroomRoster({ schoolId: 'school-1', mappingId: 'map-1' })
    );

    expect(result.type).toBe('googleClassroom/syncRoster/rejected');
    expect(store.getState().GoogleClassroom.syncingMappingId).toBeNull();
    expect(store.getState().GoogleClassroom.rosterSyncState).toBe('failed');
  });
});
