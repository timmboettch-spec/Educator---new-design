import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';

const apiRequest = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: { request: (...args: unknown[]) => apiRequest(...args) },
}));

const review = vi.fn();
vi.mock('../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('../../../src/components/common/Toast', () => ({ toast }));

import { reportsApi } from '../../../src/redux/api/reports/reportsApi';
import { useMarkAllSimReports } from '../../../src/hooks/useMarkAllSimReports';

const buildStore = () =>
  configureStore({
    reducer: { [reportsApi.reducerPath]: reportsApi.reducer },
    middleware: (getDefault) => getDefault().concat(reportsApi.middleware),
  });

const page = (ids: string[], pageNo: number, hasNextPage: boolean) => ({
  data: {
    message: 'ok',
    data: ids.map((reportId) => ({ reportId })),
    meta: {
      total: 0,
      page: pageNo,
      pageSize: 50,
      totalPages: 2,
      hasNextPage,
      hasPrevPage: pageNo > 1,
    },
  },
});

const renderMarkAll = () => {
  const store = buildStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useMarkAllSimReports(), { wrapper }).result;
};

describe('useMarkAllSimReports', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    review.mockReset().mockResolvedValue(true);
    toast.info.mockReset();
    toast.error.mockReset();
  });

  it("collects every page of the class's reports for the sim and reviews them by id", async () => {
    apiRequest
      .mockResolvedValueOnce(page(['r1', 'r2'], 1, true))
      .mockResolvedValueOnce(page(['r3'], 2, false));
    const result = renderMarkAll();

    let ok = false;
    await act(async () => {
      ok = await result.current.markAll('class-1', 'sim-1', true);
    });

    expect(ok).toBe(true);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const [first, second] = apiRequest.mock.calls.map(
      ([args]) => (args as { params: Record<string, unknown> }).params
    );
    expect(first).toMatchObject({
      classIds: ['class-1'],
      simulationIds: ['sim-1'],
      page: 1,
      pageSize: 50,
    });
    expect(second).toMatchObject({ page: 2 });
    expect(review).toHaveBeenCalledWith({
      type: 'report',
      ids: ['r1', 'r2', 'r3'],
      reviewed: true,
      classId: 'class-1',
    });
  });

  it('marks unreviewed with the same report ids', async () => {
    apiRequest.mockResolvedValueOnce(page(['r1'], 1, false));
    const result = renderMarkAll();

    await act(async () => {
      await result.current.markAll('class-1', 'sim-1', false);
    });

    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['r1'], reviewed: false })
    );
  });

  it('tells the educator when there is nothing to review', async () => {
    apiRequest.mockResolvedValueOnce(page([], 1, false));
    const result = renderMarkAll();

    let ok = true;
    await act(async () => {
      ok = await result.current.markAll('class-1', 'sim-1', true);
    });

    expect(ok).toBe(false);
    expect(review).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('No reports needed updating');
  });

  it('shows the BE message and skips the review when the list fails', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'List failed' } },
    });
    const result = renderMarkAll();

    let ok = true;
    await act(async () => {
      ok = await result.current.markAll('class-1', 'sim-1', true);
    });

    expect(ok).toBe(false);
    expect(review).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('resolves false when the bulk review fails, so nothing is cleared', async () => {
    apiRequest.mockResolvedValueOnce(page(['r1', 'r2'], 1, false));
    // useBulkReportReview shows the error toast and leaves the review state as it was.
    review.mockResolvedValueOnce(false);
    const result = renderMarkAll();

    let ok = true;
    await act(async () => {
      ok = await result.current.markAll('class-1', 'sim-1', true);
    });

    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['r1', 'r2'], reviewed: true })
    );
    expect(ok).toBe(false);
  });

  it('does nothing without a class or simulation', async () => {
    const result = renderMarkAll();

    await act(async () => {
      await result.current.markAll('', 'sim-1', true);
    });

    expect(apiRequest).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });
});
