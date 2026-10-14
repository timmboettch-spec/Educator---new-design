import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { studentsApi } from '../../../src/redux/api/students/studentsApi';
import { StudentSortField } from '../../../src/redux/api/students/students.types';

const buildStore = () =>
  configureStore({
    reducer: { [studentsApi.reducerPath]: studentsApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(studentsApi.middleware),
  });

describe('studentsApi', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getStudentOptions always sends lite=true with the filters and returns data + meta', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [{ id: 's1', studentId: 'STU-AB12', name: 'Ava Thompson' }],
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
      studentsApi.endpoints.getStudentOptions.initiate({
        classIds: ['c1'],
        search: 'ava',
        pageSize: 50,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/students',
        method: 'GET',
        params: { classIds: ['c1'], search: 'ava', pageSize: 50, lite: true },
      })
    );
    expect(result.data?.data).toEqual([
      { id: 's1', studentId: 'STU-AB12', name: 'Ava Thompson' },
    ]);
    expect(result.data?.meta.total).toBe(1);
  });

  it('surfaces a 403 as the query error', async () => {
    apiRequest.mockRejectedValue({
      response: { status: 403, data: { message: 'Insufficient role' } },
    });

    const store = buildStore();
    const result = await store.dispatch(
      studentsApi.endpoints.getStudentOptions.initiate()
    );

    expect(result.error).toEqual({
      status: 403,
      data: { message: 'Insufficient role' },
    });
  });

  it('getClassRosterInfinite requests full rows with the sort, then the next page from meta', async () => {
    const row = (id: string) => ({ id, studentId: id, reportsCount: 0 });
    const meta = (page: number, hasNextPage: boolean) => ({
      total: 2,
      page,
      pageSize: 1,
      totalPages: 2,
      hasNextPage,
      hasPrevPage: page > 1,
    });
    apiRequest
      .mockResolvedValueOnce({
        data: { message: 'ok', data: [row('s1')], meta: meta(1, true) },
      })
      .mockResolvedValueOnce({
        data: { message: 'ok', data: [row('s2')], meta: meta(2, false) },
      });

    const store = buildStore();
    const arg = {
      pageSize: 1,
      classIds: ['c1'],
      sortBy: StudentSortField.REPORTS,
      sortDir: 'desc' as const,
    };
    const first = await store.dispatch(
      studentsApi.endpoints.getClassRosterInfinite.initiate(arg)
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/students',
        method: 'GET',
        params: { ...arg, lite: false, page: 1 },
      })
    );
    expect(first.hasNextPage).toBe(true);

    const second = await store.dispatch(
      studentsApi.endpoints.getClassRosterInfinite.initiate(arg, {
        direction: 'forward',
      })
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { ...arg, lite: false, page: 2 } })
    );
    expect(second.data?.pages.flatMap((p) => p.data)).toEqual([
      row('s1'),
      row('s2'),
    ]);
    expect(second.hasNextPage).toBe(false);
  });

  it('refetches an open roster when the Students tag is invalidated', async () => {
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
    const sub = store.dispatch(
      studentsApi.endpoints.getClassRosterInfinite.initiate({
        classIds: ['c1'],
      })
    );
    await sub;
    expect(apiRequest).toHaveBeenCalledTimes(1);

    store.dispatch(studentsApi.util.invalidateTags(['Students']));

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });
});
