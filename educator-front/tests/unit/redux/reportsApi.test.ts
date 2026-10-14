import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { reportsApi } from '../../../src/redux/api/reports/reportsApi';
import { classesApi } from '../../../src/redux/api/classes/classesApi';
import {
  ReportReviewStatus,
  ReportSortField,
  SimulationReportSelectorType,
} from '../../../src/redux/api/reports/reports.types';

const buildStore = () =>
  configureStore({
    reducer: {
      [reportsApi.reducerPath]: reportsApi.reducer,
      [classesApi.reducerPath]: classesApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        reportsApi.middleware,
        classesApi.middleware
      ),
  });

type RequestArgs = { url: string; method?: string; data?: unknown };

const REPORT = {
  reportId: 'r1',
  studentCode: 'REP-PH9N',
  mode: 'Assessment',
  simulationName: 'Cardiac Care',
  score: 82,
  performanceQuality: 'Exceptional',
  timeSpent: '00:12:34',
  completedAt: '2026-01-14T09:00:00.000Z',
  transcriptId: 'transcript-abc123',
  viewedAt: null,
  viewedBy: null,
};

const META = {
  total: 42,
  page: 2,
  pageSize: 10,
  totalPages: 5,
  hasNextPage: true,
  hasPrevPage: true,
};

describe('reportsApi', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getReports sends the filters to /api/simulation-reports/list and returns data + meta', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'Reports fetched successfully',
        data: [REPORT],
        meta: META,
      },
    });

    const store = buildStore();
    const params = {
      page: 2,
      pageSize: 10,
      classIds: ['c1', 'c2'],
      simulationIds: ['cardiac-care-v2'],
      reviewStatus: ReportReviewStatus.UNREAD,
      sortBy: ReportSortField.SCORE,
      sortDirection: 'ASC' as const,
    };
    const result = await store.dispatch(
      reportsApi.endpoints.getReports.initiate(params)
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/simulation-reports/list',
        method: 'GET',
        params,
      })
    );
    expect(result.data).toEqual({ data: [REPORT], meta: META });
  });

  it('sends no params when called without filters', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: { ...META, total: 0 } },
    });

    const store = buildStore();
    await store.dispatch(reportsApi.endpoints.getReports.initiate());

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ params: undefined })
    );
  });

  it('refetches when the Reports tag is invalidated', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [REPORT], meta: META },
    });

    const store = buildStore();
    const sub = store.dispatch(reportsApi.endpoints.getReports.initiate());
    await sub;
    expect(apiRequest).toHaveBeenCalledTimes(1);

    store.dispatch(reportsApi.util.invalidateTags(['Reports']));
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });

  it('surfaces a 403 as the query error', async () => {
    apiRequest.mockRejectedValue({
      response: { status: 403, data: { message: 'Insufficient role' } },
    });

    const store = buildStore();
    const result = await store.dispatch(
      reportsApi.endpoints.getReports.initiate()
    );

    expect(result.error).toEqual({
      status: 403,
      data: { message: 'Insufficient role' },
    });
  });
});

describe('reportsApi getReportsInfinite', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  const page = (n: number, hasNextPage: boolean, reportId: string) => ({
    data: {
      message: 'ok',
      data: [{ ...REPORT, reportId }],
      meta: { ...META, page: n, totalPages: 2, total: 2, hasNextPage },
    },
  });

  it('requests page 1, then the next page from meta, and stops on the last page', async () => {
    apiRequest
      .mockResolvedValueOnce(page(1, true, 'r1'))
      .mockResolvedValueOnce(page(2, false, 'r2'));

    const store = buildStore();
    const arg = {
      pageSize: 10,
      classIds: ['c1'],
      simulationIds: ['cardiac-care-v2'],
      sortBy: ReportSortField.COMPLETED_AT,
      sortDirection: 'DESC' as const,
    };
    const first = await store.dispatch(
      reportsApi.endpoints.getReportsInfinite.initiate(arg)
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/simulation-reports/list',
        method: 'GET',
        params: { ...arg, page: 1 },
      })
    );
    expect(first.hasNextPage).toBe(true);

    const second = await store.dispatch(
      reportsApi.endpoints.getReportsInfinite.initiate(arg, {
        direction: 'forward',
      })
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { ...arg, page: 2 } })
    );
    expect(
      second.data?.pages.flatMap((p) => p.data).map((r) => r.reportId)
    ).toEqual(['r1', 'r2']);
    expect(second.hasNextPage).toBe(false);
  });

  it('refetches the loaded pages when a review invalidates the Reports tag', async () => {
    apiRequest.mockImplementation(({ params }: { params: { page: number } }) =>
      Promise.resolve(page(params.page, params.page < 2, `r${params.page}`))
    );

    const store = buildStore();
    const arg = { pageSize: 10, classIds: ['c1'] };
    const sub = store.dispatch(
      reportsApi.endpoints.getReportsInfinite.initiate(arg)
    );
    await sub;
    await store.dispatch(
      reportsApi.endpoints.getReportsInfinite.initiate(arg, {
        direction: 'forward',
      })
    );
    expect(apiRequest).toHaveBeenCalledTimes(2);

    store.dispatch(reportsApi.util.invalidateTags(['Reports']));
    // Both loaded pages are requested again.
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(4));
    sub.unsubscribe();
  });
});

describe('reportsApi mutations', () => {
  const LIST = { message: 'ok', data: [REPORT], meta: META };
  const OVERVIEW = {
    message: 'ok',
    data: {
      activeClasses: 1,
      classesWithUnreadReports: 1,
      totalUnreadReports: 1,
      classesClosingSoon: 0,
      studentsInActiveClasses: 1,
      classesWithStudentsNearAvatarLimit: 0,
    },
  };
  const BULK_RESULT = { updatedIds: ['r1', 'r2'], notAccessibleIds: ['r9'] };

  const callsTo = (url: string) =>
    apiRequest.mock.calls.filter(([args]) => (args as RequestArgs).url === url);

  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation((args: RequestArgs) => {
      if (args.url === '/api/simulation-reports/list')
        return Promise.resolve({ data: LIST });
      if (args.url === '/api/classes/user/activity-overview')
        return Promise.resolve({ data: OVERVIEW });
      if (args.url === '/api/simulation-reports/bulk-review')
        return Promise.resolve({
          data: { message: 'Bulk review completed', data: BULK_RESULT },
        });
      if (args.url === '/api/simulation-reports/r1/viewed')
        return Promise.resolve({
          data: { message: 'Report marked as viewed', data: { id: 'r1' } },
        });
      return Promise.reject(new Error(`unexpected ${args.url}`));
    });
  });

  it('bulkReviewReports PATCHes the body and returns updated / not-accessible ids', async () => {
    const store = buildStore();
    const body = {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1', 'r2', 'r9'],
      reviewed: true,
    };
    const result = await store
      .dispatch(reportsApi.endpoints.bulkReviewReports.initiate(body))
      .unwrap();

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/simulation-reports/bulk-review',
        method: 'PATCH',
        data: body,
      })
    );
    expect(result).toEqual(BULK_RESULT);
  });

  it('bulkReviewReports refetches the reports list and the class counts', async () => {
    const store = buildStore();
    const list = store.dispatch(reportsApi.endpoints.getReports.initiate());
    const overview = store.dispatch(
      classesApi.endpoints.getActivityOverview.initiate()
    );
    await Promise.all([list, overview]);
    expect(callsTo('/api/simulation-reports/list')).toHaveLength(1);
    expect(callsTo('/api/classes/user/activity-overview')).toHaveLength(1);

    await store.dispatch(
      reportsApi.endpoints.bulkReviewReports.initiate({
        type: SimulationReportSelectorType.CLASS,
        ids: ['c1'],
        reviewed: true,
      })
    );

    await vi.waitFor(() => {
      expect(callsTo('/api/simulation-reports/list')).toHaveLength(2);
      expect(callsTo('/api/classes/user/activity-overview')).toHaveLength(2);
    });
    list.unsubscribe();
    overview.unsubscribe();
  });

  it('markReportViewed PATCHes /:id/viewed with no body and refetches the list', async () => {
    const store = buildStore();
    const list = store.dispatch(reportsApi.endpoints.getReports.initiate());
    await list;

    await store
      .dispatch(reportsApi.endpoints.markReportViewed.initiate('r1'))
      .unwrap();

    const [patch] = callsTo('/api/simulation-reports/r1/viewed');
    expect(patch?.[0]).toMatchObject({ method: 'PATCH' });
    expect((patch?.[0] as RequestArgs).data).toBeUndefined();
    await vi.waitFor(() =>
      expect(callsTo('/api/simulation-reports/list')).toHaveLength(2)
    );
    list.unsubscribe();
  });

  it('surfaces 403 and 404 errors and does not refetch the class counts', async () => {
    apiRequest.mockImplementation((args: RequestArgs) => {
      if (args.url === '/api/classes/user/activity-overview')
        return Promise.resolve({ data: OVERVIEW });
      if (args.url === '/api/simulation-reports/bulk-review')
        return Promise.reject({
          response: { status: 403, data: { message: 'Insufficient role' } },
        });
      return Promise.reject({
        response: { status: 404, data: { message: 'Report not found' } },
      });
    });

    const store = buildStore();
    const overview = store.dispatch(
      classesApi.endpoints.getActivityOverview.initiate()
    );
    await overview;

    const bulk = await store.dispatch(
      reportsApi.endpoints.bulkReviewReports.initiate({
        type: SimulationReportSelectorType.REPORT,
        ids: ['r1'],
        reviewed: false,
      })
    );
    const single = await store.dispatch(
      reportsApi.endpoints.markReportViewed.initiate('missing')
    );

    expect('error' in bulk && bulk.error).toEqual({
      status: 403,
      data: { message: 'Insufficient role' },
    });
    expect('error' in single && single.error).toEqual({
      status: 404,
      data: { message: 'Report not found' },
    });
    expect(callsTo('/api/classes/user/activity-overview')).toHaveLength(1);
    overview.unsubscribe();
  });
});
