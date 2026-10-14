import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import {
  ClassAttentionMeasure,
  CommonStatus,
} from '../../../src/redux/api/classes/classes.types';

const buildStore = () =>
  configureStore({
    reducer: { [classesApi.reducerPath]: classesApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(classesApi.middleware),
  });

describe('classesApi', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getActivityOverview requests the right URL and unwraps the envelope', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          activeClasses: 4,
          classesWithUnreadReports: 1,
          totalUnreadReports: 3,
          classesClosingSoon: 2,
          studentsInActiveClasses: 40,
          classesWithStudentsNearAvatarLimit: 1,
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getActivityOverview.initiate({
        school_id: 'school-1',
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/user/activity-overview',
        method: 'GET',
        params: { school_id: 'school-1' },
      })
    );
    expect(result.data?.activeClasses).toBe(4);
  });

  it('getAttentionSummary requests the right URL and unwraps the envelope', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          totalClasses: 12,
          classesNeedingAttention: 3,
          unreadReports: 2,
          noStudents: 1,
          noAssignedSims: 0,
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getAttentionSummary.initiate({
        school_id: 'school-1',
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/user/attention-summary',
        method: 'GET',
        params: { school_id: 'school-1' },
      })
    );
    expect(result.data).toEqual({
      totalClasses: 12,
      classesNeedingAttention: 3,
      unreadReports: 2,
      noStudents: 1,
      noAssignedSims: 0,
    });
  });

  it('getSchoolGroups requests /api/classes/schools and returns data + meta', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [{ schoolId: null, schoolName: 'Unassigned', classCount: 2 }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getSchoolGroups.initiate({
        measure: ClassAttentionMeasure.CLOSING_SOON,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/schools',
        params: { measure: 'closingSoon' },
      })
    );
    expect(result.data?.data).toHaveLength(1);
    expect(result.data?.meta.total).toBe(1);
  });

  it('getClasses requests /api/classes and returns data + meta', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [
          {
            classId: 'c1',
            className: 'Biology 101',
            startDate: '2026-01-01',
            endDate: '2026-06-01',
            studentsCount: 20,
            simsCount: 3,
            reportsCount: 5,
            status: 'ACTIVE',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getClasses.initiate({ page: 1, pageSize: 10 })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: { page: 1, pageSize: 10 },
      })
    );
    expect(result.data?.data[0]?.className).toBe('Biology 101');
  });

  it('getClasses sends measure/status params with repeated-key array serialization', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });

    const store = buildStore();
    await store.dispatch(
      classesApi.endpoints.getClasses.initiate({
        measure: ClassAttentionMeasure.NO_STUDENTS,
        status: [CommonStatus.ACTIVE],
        page: 1,
        pageSize: 50,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: {
          measure: 'noStudents',
          status: ['ACTIVE'],
          page: 1,
          pageSize: 50,
        },
        paramsSerializer: { indexes: null },
      })
    );
  });

  it('getClassOptions always sends lite=true and returns the lite items + meta', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [{ classId: 'c1', className: 'Biology 101' }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getClassOptions.initiate({
        search: 'bio',
        pageSize: 50,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: { search: 'bio', pageSize: 50, lite: true },
      })
    );
    expect(result.data?.data).toEqual([
      { classId: 'c1', className: 'Biology 101' },
    ]);
  });

  it('getSimulationsCompletedGraph sends the filters and unwraps byMonth/bySchool', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          byMonth: [{ year: 2026, month: 8, count: 298 }],
          bySchool: [{ schoolId: null, count: 298 }],
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getSimulationsCompletedGraph.initiate({
        classIds: ['c1', 'c2'],
        studentIds: ['s1'],
        months: 6,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/user/simulations-completed-graph',
        params: { classIds: ['c1', 'c2'], studentIds: ['s1'], months: 6 },
      })
    );
    expect(result.data?.byMonth).toEqual([
      { year: 2026, month: 8, count: 298 },
    ]);
  });

  it('getSimulationsCompletedGraph sends compareBy and unwraps byMonthSeries', async () => {
    const byMonthSeries = [
      {
        year: 2026,
        month: 8,
        total: 7,
        series: [
          { seriesId: 'sch-1', seriesName: 'Cedar Hollow', count: 5 },
          { seriesId: 'sch-2', seriesName: 'Pine Ridge', count: 2 },
        ],
      },
    ];
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: { byMonth: [{ year: 2026, month: 8, count: 7 }], byMonthSeries },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getSimulationsCompletedGraph.initiate({
        schoolIds: ['sch-1', 'sch-2'],
        months: 12,
        compareBy: 'school',
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/user/simulations-completed-graph',
        params: {
          schoolIds: ['sch-1', 'sch-2'],
          months: 12,
          compareBy: 'school',
        },
      })
    );
    expect(result.data?.byMonthSeries).toEqual(byMonthSeries);
  });

  it('getSimulationsCompletedGraph drills into a school and unwraps byClass', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          byMonth: [{ year: 2026, month: 8, count: 15 }],
          byClass: [{ classId: 'c1', className: 'Biology 101', count: 15 }],
        },
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getSimulationsCompletedGraph.initiate({
        forSchool: 'sch-1',
        months: 12,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/user/simulations-completed-graph',
        params: { forSchool: 'sch-1', months: 12 },
      })
    );
    expect(result.data?.byClass).toEqual([
      { classId: 'c1', className: 'Biology 101', count: 15 },
    ]);
    expect(result.data?.bySchool).toBeUndefined();
  });

  it('surfaces axios error status/data as the query error', async () => {
    apiRequest.mockRejectedValue({
      response: { status: 401, data: { message: 'Unauthorized' } },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getAttentionSummary.initiate()
    );

    expect(result.error).toEqual({
      status: 401,
      data: { message: 'Unauthorized' },
    });
  });

  describe('class mutations', () => {
    const classRes = {
      classId: 'cls-1',
      className: 'Bio 101',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('createClass POSTs the body with a 30s timeout and unwraps data', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'Class created successfully', data: classRes },
      });
      const body = {
        className: 'Bio 101',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalNoOfStudents: 20,
      };

      const store = buildStore();
      const result = await store.dispatch(
        classesApi.endpoints.createClass.initiate(body)
      );

      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/classes',
          method: 'POST',
          data: body,
          timeout: 30_000,
        })
      );
      expect('data' in result && result.data).toEqual(classRes);
    });

    it('updateClass PUTs the body to /api/classes/:id and unwraps data', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'Class updated successfully', data: classRes },
      });
      const body = { className: 'Bio 101', status: CommonStatus.ACTIVE };

      const store = buildStore();
      const result = await store.dispatch(
        classesApi.endpoints.updateClass.initiate({ id: 'cls-1', body })
      );

      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/classes/cls-1',
          method: 'PUT',
          data: body,
        })
      );
      expect('data' in result && result.data).toEqual(classRes);
    });

    it('deleteClass DELETEs /api/classes/:id with the ngrok header and unwraps data', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'Class deleted successfully', data: {} },
      });

      const store = buildStore();
      const result = await store.dispatch(
        classesApi.endpoints.deleteClass.initiate('cls-1')
      );

      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/classes/cls-1',
          method: 'DELETE',
          headers: { 'ngrok-skip-browser-warning': 'true' },
        })
      );
      expect('data' in result && result.data).toEqual({});
    });

    it('a successful mutation refetches queries tagged Classes', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'ok', data: { statuses: [] } },
      });
      const store = buildStore();
      const sub = store.dispatch(
        classesApi.endpoints.getAttentionSummary.initiate()
      );
      await sub;
      const attentionCalls = () =>
        apiRequest.mock.calls.filter(
          ([args]) => args.url === '/api/classes/user/attention-summary'
        ).length;
      expect(attentionCalls()).toBe(1);

      apiRequest.mockResolvedValue({ data: { message: 'ok', data: {} } });
      await store.dispatch(classesApi.endpoints.deleteClass.initiate('cls-1'));

      await vi.waitFor(() => expect(attentionCalls()).toBe(2));
      sub.unsubscribe();
    });

    it('a successful mutation refetches school groups so class counts stay fresh', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'ok', data: [], meta: {} },
      });
      const store = buildStore();
      const sub = store.dispatch(
        classesApi.endpoints.getSchoolGroups.initiate()
      );
      await sub;
      const schoolGroupCalls = () =>
        apiRequest.mock.calls.filter(
          ([args]) => args.url === '/api/classes/schools'
        ).length;
      expect(schoolGroupCalls()).toBe(1);

      apiRequest.mockResolvedValue({ data: { message: 'ok', data: {} } });
      await store.dispatch(classesApi.endpoints.deleteClass.initiate('cls-1'));

      await vi.waitFor(() => expect(schoolGroupCalls()).toBe(2));
      sub.unsubscribe();
    });
  });
});
