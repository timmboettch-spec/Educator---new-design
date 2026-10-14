import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';
import { useAttentionDrillDown } from '../../../src/hooks/useAttentionDrillDown';

const renderWithFreshStore = () => {
  const store = configureStore({
    reducer: { [classesApi.reducerPath]: classesApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(classesApi.middleware),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useAttentionDrillDown(), { wrapper });
};

const listResponse = (classIds: string[], totalPages = 1) => ({
  data: {
    message: 'ok',
    data: classIds.map((classId) => ({ classId })),
    meta: {
      total: classIds.length,
      page: 1,
      pageSize: 50,
      totalPages,
      hasNextPage: totalPages > 1,
      hasPrevPage: false,
    },
  },
});

const pageOf = (args: unknown) =>
  (args as { params: { page: number } }).params.page;

describe('useAttentionDrillDown', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('fetches active classes for the measure and returns their IDs', async () => {
    apiRequest.mockResolvedValue(listResponse(['c1', 'c2']));
    const { result } = renderWithFreshStore();

    let ids: string[] | null = null;
    await act(async () => {
      ids = await result.current.fetchClassIds(
        ClassAttentionMeasure.NO_STUDENTS
      );
    });

    expect(ids).toEqual(['c1', 'c2']);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/classes',
        params: {
          measure: 'noStudents',
          status: ['ACTIVE'],
          page: 1,
          pageSize: 50,
        },
      })
    );
  });

  it('fetches the remaining pages in parallel and returns IDs in page order', async () => {
    const pending: Record<number, (value: unknown) => void> = {};
    apiRequest.mockImplementation((args: unknown) => {
      const page = pageOf(args);
      if (page === 1) return Promise.resolve(listResponse(['p1a', 'p1b'], 3));
      return new Promise((resolve) => (pending[page] = resolve));
    });
    const { result } = renderWithFreshStore();

    let ids: string[] | null = null;
    await act(async () => {
      const call = result.current.fetchClassIds(
        ClassAttentionMeasure.UNREAD_REPORTS
      );
      // Pages 2 and 3 are both in flight before either resolves.
      await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3));
      pending[3]?.(listResponse(['p3a'], 3));
      pending[2]?.(listResponse(['p2a'], 3));
      ids = await call;
    });

    expect(ids).toEqual(['p1a', 'p1b', 'p2a', 'p3a']);
    expect(apiRequest.mock.calls.map(([args]) => pageOf(args)).sort()).toEqual([
      1, 2, 3,
    ]);
  });

  it('resolves null when superseded while later pages are loading', async () => {
    let resolveOldPage2: (value: unknown) => void = () => {};
    apiRequest
      .mockResolvedValueOnce(listResponse(['old-1'], 2))
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOldPage2 = resolve))
      )
      .mockResolvedValueOnce(listResponse(['new-1']));
    const { result } = renderWithFreshStore();

    let first: string[] | null | undefined;
    let second: string[] | null | undefined;
    await act(async () => {
      const firstCall = result.current.fetchClassIds(
        ClassAttentionMeasure.NO_STUDENTS
      );
      await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
      second = await result.current.fetchClassIds(
        ClassAttentionMeasure.NO_ASSIGNED_SIMS
      );
      resolveOldPage2(listResponse(['old-2'], 2));
      first = await firstCall;
    });

    expect(second).toEqual(['new-1']);
    expect(first).toBeNull();
  });

  it('resolves a superseded call to null even when its page later rejects', async () => {
    let rejectOld: (reason: unknown) => void = () => {};
    apiRequest
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejectOld = reject))
      )
      .mockResolvedValueOnce(listResponse(['new-1']));
    const { result } = renderWithFreshStore();

    let first: string[] | null | undefined;
    let second: string[] | null | undefined;
    await act(async () => {
      const firstCall = result.current.fetchClassIds(
        ClassAttentionMeasure.UNREAD_REPORTS
      );
      second = await result.current.fetchClassIds(
        ClassAttentionMeasure.NO_STUDENTS
      );
      rejectOld({ response: { status: 500, data: 'stale boom' } });
      first = await firstCall;
    });

    expect(second).toEqual(['new-1']);
    expect(first).toBeNull();
  });

  it('rejects when a later page fails', async () => {
    apiRequest.mockImplementation((args: unknown) =>
      pageOf(args) === 1
        ? Promise.resolve(listResponse(['p1a'], 2))
        : Promise.reject({ response: { status: 500, data: 'boom' } })
    );
    const { result } = renderWithFreshStore();

    await act(async () => {
      await expect(
        result.current.fetchClassIds(ClassAttentionMeasure.NO_ASSIGNED_SIMS)
      ).rejects.toBeTruthy();
    });
  });

  it('resolves a superseded call to null so the latest click wins', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    apiRequest
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve))
      )
      .mockResolvedValueOnce(listResponse(['latest']));
    const { result } = renderWithFreshStore();

    let first: string[] | null | undefined;
    let second: string[] | null | undefined;
    await act(async () => {
      const firstCall = result.current.fetchClassIds(
        ClassAttentionMeasure.UNREAD_REPORTS
      );
      second = await result.current.fetchClassIds(
        ClassAttentionMeasure.NO_ASSIGNED_SIMS
      );
      resolveFirst(listResponse(['stale']));
      first = await firstCall;
    });

    expect(second).toEqual(['latest']);
    expect(first).toBeNull();
  });

  it('rejects when the request fails', async () => {
    apiRequest.mockRejectedValue({ response: { status: 500, data: 'boom' } });
    const { result } = renderWithFreshStore();

    await act(async () => {
      await expect(
        result.current.fetchClassIds(ClassAttentionMeasure.NO_STUDENTS)
      ).rejects.toBeTruthy();
    });
  });
});
