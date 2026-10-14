import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { CommonStatus } from '../../../src/redux/api/classes/classes.types';

const buildStore = () =>
  configureStore({
    reducer: { [classesApi.reducerPath]: classesApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(classesApi.middleware),
  });

const meta = (page: number, hasNextPage: boolean) => ({
  total: 3,
  page,
  pageSize: 2,
  totalPages: 2,
  hasNextPage,
  hasPrevPage: page > 1,
});

describe('classesApi infinite lists', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getSchoolGroupsInfinite requests page 1, then the next page from meta', async () => {
    apiRequest
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [{ schoolId: 's-1', schoolName: 'Hillcrest', classCount: 2 }],
          meta: meta(1, true),
        },
      })
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [{ schoolId: 's-2', schoolName: 'Riverside', classCount: 1 }],
          meta: meta(2, false),
        },
      });

    const store = buildStore();
    const arg = { pageSize: 2, className: 'bio' };
    const first = await store.dispatch(
      classesApi.endpoints.getSchoolGroupsInfinite.initiate(arg)
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/classes/schools',
        method: 'GET',
        params: { pageSize: 2, className: 'bio', page: 1 },
      })
    );
    expect(first.hasNextPage).toBe(true);

    const second = await store.dispatch(
      classesApi.endpoints.getSchoolGroupsInfinite.initiate(arg, {
        direction: 'forward',
      })
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { pageSize: 2, className: 'bio', page: 2 },
      })
    );
    expect(second.data?.pages.flatMap((p) => p.data)).toEqual([
      { schoolId: 's-1', schoolName: 'Hillcrest', classCount: 2 },
      { schoolId: 's-2', schoolName: 'Riverside', classCount: 1 },
    ]);
    expect(second.hasNextPage).toBe(false);
  });

  it('getClassesInfinite sends the filters with repeated-key arrays and the page number', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: meta(1, false) },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getClassesInfinite.initiate({
        pageSize: 10,
        schoolIds: ['s-1'],
        status: [CommonStatus.ACTIVE, CommonStatus.DRAFT],
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: {
          pageSize: 10,
          schoolIds: ['s-1'],
          status: ['ACTIVE', 'DRAFT'],
          page: 1,
        },
        paramsSerializer: { indexes: null },
      })
    );
    expect(result.hasNextPage).toBe(false);
  });

  it('refetches an open infinite list after a class mutation invalidates Classes', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: meta(1, false) },
    });
    const store = buildStore();
    const sub = store.dispatch(
      classesApi.endpoints.getClassesInfinite.initiate({ schoolIds: ['s-1'] })
    );
    await sub;
    const classListCalls = () =>
      apiRequest.mock.calls.filter(([args]) => args.url === '/api/classes')
        .length;
    expect(classListCalls()).toBe(1);

    apiRequest.mockResolvedValueOnce({ data: { message: 'ok', data: {} } });
    await store.dispatch(classesApi.endpoints.deleteClass.initiate('cls-1'));

    await vi.waitFor(() => expect(classListCalls()).toBe(2));
    sub.unsubscribe();
  });
});

describe('classesApi filter dropdown options', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getClassOptionsInfinite pages lite classes of the picked schools', async () => {
    apiRequest
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [{ classId: 'c-1', className: 'Biology' }],
          meta: meta(1, true),
        },
      })
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [{ classId: 'c-2', className: 'Chemistry' }],
          meta: meta(2, false),
        },
      });

    const store = buildStore();
    const arg = { pageSize: 20, search: 'bio', schoolIds: ['s-1'] };
    await store.dispatch(
      classesApi.endpoints.getClassOptionsInfinite.initiate(arg)
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: {
          pageSize: 20,
          search: 'bio',
          schoolIds: ['s-1'],
          lite: true,
          page: 1,
        },
      })
    );

    const second = await store.dispatch(
      classesApi.endpoints.getClassOptionsInfinite.initiate(arg, {
        direction: 'forward',
      })
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ lite: true, page: 2 }),
      })
    );
    expect(second.data?.pages.flatMap((p) => p.data)).toEqual([
      { classId: 'c-1', className: 'Biology' },
      { classId: 'c-2', className: 'Chemistry' },
    ]);
    expect(second.hasNextPage).toBe(false);
  });

  it('getAssignClassOptionsInfinite pages full class rows (not lite)', async () => {
    const row = {
      classId: 'c-1',
      className: 'Biology',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      studentsCount: 12,
      simsCount: 0,
      reportsCount: 0,
      status: 'ACTIVE',
    };
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [row], meta: meta(1, false) },
    });

    const store = buildStore();
    const arg = {
      pageSize: 20,
      schoolIds: ['s-1'],
      status: [CommonStatus.ACTIVE],
    };
    const result = await store.dispatch(
      classesApi.endpoints.getAssignClassOptionsInfinite.initiate(arg)
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: { ...arg, page: 1 },
      })
    );
    expect(result.data?.pages.flatMap((p) => p.data)).toEqual([row]);
  });

  it('getSchoolOptionsInfinite searches school groups by name', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [{ schoolId: 's-1', schoolName: 'Hillcrest', classCount: 1 }],
        meta: meta(1, false),
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classesApi.endpoints.getSchoolOptionsInfinite.initiate({
        pageSize: 20,
        schoolName: 'hill',
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes/schools',
        params: { pageSize: 20, schoolName: 'hill', page: 1 },
      })
    );
    expect(result.data?.pages[0]?.data).toEqual([
      { schoolId: 's-1', schoolName: 'Hillcrest', classCount: 1 },
    ]);
  });

  it('refetches loaded class options after a class mutation invalidates Classes', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: meta(1, false) },
    });
    const store = buildStore();
    const sub = store.dispatch(
      classesApi.endpoints.getClassOptionsInfinite.initiate({ pageSize: 20 })
    );
    await sub;
    const liteCalls = () =>
      apiRequest.mock.calls.filter(([args]) => args.params?.lite === true)
        .length;
    expect(liteCalls()).toBe(1);

    apiRequest.mockResolvedValueOnce({ data: { message: 'ok', data: {} } });
    await store.dispatch(classesApi.endpoints.deleteClass.initiate('cls-1'));

    await vi.waitFor(() => expect(liteCalls()).toBe(2));
    sub.unsubscribe();
  });
});
