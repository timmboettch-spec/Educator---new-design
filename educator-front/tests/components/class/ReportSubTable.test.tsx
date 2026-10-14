import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
    get: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(),
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../src/components/common/Toast', () => ({ toast }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

import { renderWithProviders } from '../../../src/test/testUtils';
import { store } from '../../../src/store';
import { reportsApi } from '../../../src/redux/api/reports/reportsApi';
import ReportSubTable from '../../../src/components/class/ReportSubTable';
import { FetchSimulationsByClass } from '../../../src/redux/class/GetSimsRedux';
import i18n from '../../../src/i18n';
import {
  SKELETON_INITIAL_ROW_COUNT,
  SKELETON_REFETCH_ROW_COUNT,
} from '../../../src/utils/constants/skeleton';

const LIST = '/api/simulation-reports/list';
const BULK = '/api/simulation-reports/bulk-review';

type Args = {
  url: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
};
const callsTo = (url: string) =>
  apiRequest.mock.calls.map(([a]) => a as Args).filter((a) => a.url === url);

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  reportId: `r${n}`,
  studentCode: `STU-${n}`,
  mode: 'Assessment',
  simulationName: `Sim ${n}`,
  score: 82,
  performanceQuality: 'Exceptional',
  timeSpent: '00:12:34',
  completedAt: '2026-01-14T09:00:00.000Z',
  transcriptId: `t${n}`,
  viewedAt: null,
  viewedBy: null,
  ...overrides,
});

const meta = (page: number, totalPages: number, total: number) => ({
  total,
  page,
  pageSize: 10,
  totalPages,
  hasNextPage: page < totalPages,
  hasPrevPage: page > 1,
});

let listReply: (params: Record<string, unknown>) => unknown;

// The load-more sentinel's observer; `loadMore` reports it as scrolled into view.
type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallback: ObserverCallback | null = null;
const loadMore = () =>
  act(() => observerCallback?.([{ isIntersecting: true }]));

// Two pages: 1 and 2 on the first, 11 on the second.
const twoPages = (params: Record<string, unknown>) => ({
  message: 'ok',
  data: Number(params['page']) === 2 ? [row(11)] : [row(1), row(2)],
  meta: meta(Number(params['page']), 2, 3),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  observerCallback = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
  );
  window.history.replaceState(null, '', '/classes');
  apiRequest.mockReset();
  Object.values(toast).forEach((fn) => fn.mockClear());
  mockNavigate.mockClear();
  store.dispatch(reportsApi.util.resetApiState());
  listReply = () => ({
    message: 'ok',
    data: [row(1), row(2, { viewedAt: '2026-01-15T10:30:00.000Z' })],
    meta: meta(1, 1, 2),
  });
  apiRequest.mockImplementation((args: Args) => {
    if (args.url === LIST)
      return Promise.resolve({ data: listReply(args.params ?? {}) });
    if (args.url === BULK)
      return Promise.resolve({
        data: {
          message: 'Bulk review completed',
          data: {
            updatedIds: (args.data as { ids: string[] }).ids,
            notAccessibleIds: [],
          },
        },
      });
    return Promise.reject(new Error(`unexpected ${args.url}`));
  });
});

const renderTable = () =>
  renderWithProviders(<ReportSubTable classId="class-1" />);

const lastListParams = () => callsTo(LIST).at(-1)?.params;

describe('ReportSubTable', () => {
  it('loads the class reports from the listing API, newest first', async () => {
    renderTable();

    expect(await screen.findByText('Sim 1')).toBeInTheDocument();
    expect(lastListParams()).toEqual({
      classIds: ['class-1'],
      page: 1,
      pageSize: 10,
      sortBy: 'completedAt',
      sortDirection: 'DESC',
    });
  });

  it('shows only the design columns, in order', async () => {
    renderTable();
    await screen.findByText('Sim 1');

    const headers = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())
      .filter(Boolean);
    expect(headers).toEqual([
      'Student Code',
      'Mode',
      'Simulation Name',
      'Score',
      'Performance Quality',
      'Time Spent',
      'Completed At',
      'View Reports / Transcripts',
    ]);
    expect(screen.queryByText('Student Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('maps the API row onto the table cells', async () => {
    renderTable();
    const cells = within(
      (await screen.findByText('Sim 1')).closest('tr') as HTMLElement
    );

    expect(cells.getByText('STU-1')).toBeInTheDocument();
    expect(cells.getByText('Assessment')).toBeInTheDocument();
    expect(cells.getByText('82%')).toBeInTheDocument();
    expect(cells.getByText('Exceptional')).toBeInTheDocument();
    expect(cells.getByText('12m 34s')).toBeInTheDocument();
    // viewedAt null → NEW; the viewed report has no badge.
    expect(cells.getByText('NEW')).toBeInTheDocument();
    expect(
      within(
        screen.getByText('Sim 2').closest('tr') as HTMLElement
      ).queryByText('NEW')
    ).not.toBeInTheDocument();
  });

  it('shows no NEW badge next to a missing simulation name', async () => {
    listReply = () => ({
      message: 'ok',
      data: [row(1, { simulationName: '' }), row(2, { simulationName: '  ' })],
      meta: meta(1, 1, 2),
    });
    renderTable();
    expect(await screen.findAllByText('STU-1')).toHaveLength(1);

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
    // Still unread: the View Report button keeps its filled style.
    expect(
      within(screen.getByText('STU-1').closest('tr') as HTMLElement).getByRole(
        'button',
        { name: 'View Report' }
      )
    ).toHaveClass('bg-primary-500');
  });

  it('exposes the sort state on the column headers', async () => {
    renderTable();
    await screen.findByText('Sim 1');
    expect(
      screen.getByRole('columnheader', { name: /Completed At/ })
    ).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /Score/ })).toHaveAttribute(
      'aria-sort',
      'none'
    );
    expect(
      screen.getByRole('columnheader', { name: /Performance Quality/ })
    ).not.toHaveAttribute('aria-sort');
  });

  it('sorts on the server and goes back to page 1', async () => {
    renderTable();
    await screen.findByText('Sim 1');

    fireEvent.click(screen.getByText('Score'));
    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        sortBy: 'score',
        sortDirection: 'ASC',
        page: 1,
      })
    );

    fireEvent.click(screen.getByText('Score'));
    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        sortBy: 'score',
        sortDirection: 'DESC',
      })
    );
  });

  it('loads the next page below the loaded rows as the end scrolls into view', async () => {
    listReply = twoPages;
    renderTable();
    await screen.findByText('Sim 1');
    expect(callsTo(LIST)).toHaveLength(1);

    loadMore();

    expect(await screen.findByText('Sim 11')).toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ page: 2 });
    // The first page stays, and the end of the list is announced.
    expect(screen.getByText('Sim 1')).toBeInTheDocument();
    expect(screen.getByText('All reports are shown.')).toBeInTheDocument();
  });

  it('shows skeleton rows below the loaded rows while the next page loads', async () => {
    let finishPage2: (value: unknown) => void = () => {};
    apiRequest.mockImplementation((args: Args) => {
      if (args.url !== LIST)
        return Promise.reject(new Error(`unexpected ${args.url}`));
      if (Number(args.params?.['page']) === 2)
        return new Promise((resolve) => {
          finishPage2 = resolve;
        });
      return Promise.resolve({ data: twoPages(args.params ?? {}) });
    });
    renderTable();
    await screen.findByText('Sim 1');
    const table = screen.getByRole('table');
    expect(within(table).queryByRole('status')).not.toBeInTheDocument();

    loadMore();

    expect(await within(table).findByRole('status')).toHaveTextContent(
      'Loading reports'
    );
    // Header + the 2 loaded rows + the next-page placeholder.
    expect(within(table).getAllByRole('row')).toHaveLength(
      1 + 2 + SKELETON_REFETCH_ROW_COUNT
    );
    expect(screen.getByText('Sim 1')).toBeInTheDocument();
    expect(screen.queryByText('Loading more…')).not.toBeInTheDocument();

    await act(async () => finishPage2({ data: twoPages({ page: 2 }) }));
    expect(await screen.findByText('Sim 11')).toBeInTheDocument();
    expect(within(table).queryByRole('status')).not.toBeInTheDocument();
  });

  it('has no pagination', async () => {
    listReply = twoPages;
    renderTable();
    await screen.findByText('Sim 1');

    expect(screen.queryByText(/Results:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });

  it('offers a retry when the next page fails', async () => {
    let failNext = true;
    listReply = (params) => {
      if (Number(params['page']) === 2 && failNext) {
        failNext = false;
        throw { response: { status: 500, data: {} } };
      }
      return twoPages(params);
    };
    apiRequest.mockImplementation((args: Args) => {
      if (args.url !== LIST)
        return Promise.reject(new Error(`unexpected ${args.url}`));
      try {
        return Promise.resolve({ data: listReply(args.params ?? {}) });
      } catch (error) {
        return Promise.reject(error);
      }
    });
    renderTable();
    await screen.findByText('Sim 1');

    loadMore();
    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument();
    // The loaded rows stay.
    expect(screen.getByText('Sim 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Sim 11')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    listReply = () => ({ message: 'ok', data: [], meta: meta(1, 0, 0) });
    renderTable();
    expect(
      await screen.findByText('No report data available')
    ).toBeInTheDocument();
  });

  it('shows a friendly error when the list fails', async () => {
    apiRequest.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: {} } })
    );
    renderTable();
    expect(
      await screen.findByText(
        "We couldn't load reports right now. Please try again."
      )
    ).toBeInTheDocument();
  });

  it('opens the report detail by id', async () => {
    renderTable();
    const cells = within(
      (await screen.findByText('Sim 1')).closest('tr') as HTMLElement
    );
    fireEvent.click(cells.getByRole('button', { name: 'View Report' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/report-detail',
      expect.objectContaining({
        state: expect.objectContaining({
          report: expect.objectContaining({ id: 'r1', class_id: 'class-1' }),
        }),
      })
    );
  });

  it('keeps the table state in the path it returns to', async () => {
    window.history.replaceState(
      null,
      '',
      '/classes?reportsClass=class-1&reportStatus=unread'
    );
    renderTable();
    const cells = within(
      (await screen.findByText('Sim 1')).closest('tr') as HTMLElement
    );
    fireEvent.click(cells.getByRole('button', { name: 'View Report' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/report-detail',
      expect.objectContaining({
        state: expect.objectContaining({
          backPath: '/classes?reportsClass=class-1&reportStatus=unread',
        }),
      })
    );
  });

  describe('layout inside the class list', () => {
    it('has no inner vertical scroller, so the header moves with its rows', async () => {
      renderTable();
      await screen.findByText('Sim 1');

      const table = screen.getByRole('table');
      expect(table.parentElement).toHaveClass('overflow-x-auto');
      expect(table.parentElement).not.toHaveClass('overflow-y-auto');
      expect(table.parentElement?.className).not.toMatch(/max-h-/);
      expect(table.querySelector('thead')).not.toHaveClass('sticky');
    });

    it('loads more against the class list scroll area', async () => {
      const scrollRoot = document.createElement('div');
      const IntersectionObserverSpy = vi.fn();
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: ObserverCallback, options: unknown) {
            observerCallback = callback;
            IntersectionObserverSpy(options);
          }
          observe = vi.fn();
          disconnect = vi.fn();
          unobserve = vi.fn();
        }
      );
      listReply = twoPages;
      renderWithProviders(
        <ReportSubTable
          classId="class-1"
          scrollRootRef={{ current: scrollRoot }}
        />
      );
      await screen.findByText('Sim 1');

      expect(IntersectionObserverSpy).toHaveBeenCalledWith(
        expect.objectContaining({ root: scrollRoot })
      );
    });
  });

  it('matches a report to the assignment whose window contains it', async () => {
    const assignment = (id: string, start: string, end: string) => ({
      id,
      simulation_id: `lib-${id}`,
      simulation_title: 'Sim 1',
      start_date: start,
      due_date: end,
      end_date: end,
    });
    // Same sim assigned twice; the later-listed one would win a title-only lookup.
    store.dispatch({
      type: FetchSimulationsByClass.fulfilled.type,
      payload: {
        classId: 'class-1',
        data: [
          assignment('a-jan', '2026-01-01', '2026-01-10'),
          assignment('a-dec', '2025-12-01', '2025-12-15'),
        ],
      },
    });
    listReply = () => ({
      message: 'ok',
      data: [
        // In January's window, before its due date: on time.
        row(1, {
          simulationName: 'Sim 1',
          completedAt: '2026-01-05T09:00:00.000Z',
        }),
        // In December's window, after its due date: late.
        row(2, {
          simulationName: 'Sim 1',
          completedAt: '2025-12-20T09:00:00.000Z',
        }),
      ],
      meta: meta(1, 1, 2),
    });
    renderTable();

    const rows = (await screen.findAllByText('Sim 1')).map(
      (el) => el.closest('tr') as HTMLElement
    );
    expect(
      within(rows[0] as HTMLElement).queryByText('LATE')
    ).not.toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText('LATE')
    ).toBeInTheDocument();

    store.dispatch({
      type: FetchSimulationsByClass.fulfilled.type,
      payload: { classId: 'class-1', data: [] },
    });
  });

  it('shows the table in Spanish from the classManagement namespace', async () => {
    await i18n.changeLanguage('es');
    try {
      renderTable();
      await screen.findByText('Sim 1');
      expect(
        screen.getByRole('columnheader', { name: /Código del estudiante/ })
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Ver reporte' })
      ).toHaveLength(2);
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  describe('bulk review across loaded pages', () => {
    beforeEach(() => {
      listReply = twoPages;
    });

    it('keeps selections as more pages load and reviews them in one request', async () => {
      renderTable();
      await screen.findByText('Sim 1');
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Select report .*Sim 1$/ })
      );

      loadMore();
      await screen.findByText('Sim 11');
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Select report .*Sim 11/ })
      );
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      const listCallsBefore = callsTo(LIST).length;
      fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

      await waitFor(() => expect(callsTo(BULK)).toHaveLength(1));
      expect(callsTo(BULK)[0]).toMatchObject({
        method: 'PATCH',
        data: { type: 'report', ids: ['r1', 'r11'], reviewed: true },
      });
      // The list refetches so the NEW badges come from the BE.
      await waitFor(() =>
        expect(callsTo(LIST).length).toBeGreaterThan(listCallsBefore)
      );
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('"Mark all" reviews every page of the class', async () => {
      renderTable();
      await screen.findByText('Sim 1');
      fireEvent.click(
        screen.getByRole('button', { name: 'Mark all unreviewed' })
      );

      await waitFor(() => expect(callsTo(BULK)).toHaveLength(1));
      expect(callsTo(BULK)[0]?.data).toEqual({
        type: 'class',
        ids: ['class-1'],
        reviewed: false,
      });
    });
  });

  describe('loading while reviewing', () => {
    it('shows the initial skeleton rows while the first page loads', async () => {
      apiRequest.mockImplementation(() => new Promise(() => {}));
      renderTable();

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Loading reports'
      );
      expect(
        within(screen.getByRole('table')).getAllByRole('row')
      ).toHaveLength(1 + SKELETON_INITIAL_ROW_COUNT);
    });

    it('keeps the loaded rows and marks the table busy while reviewing', async () => {
      let finishBulk: (value: unknown) => void = () => {};
      apiRequest.mockImplementation((args: Args) => {
        if (args.url === LIST)
          return Promise.resolve({ data: listReply(args.params ?? {}) });
        if (args.url === BULK)
          return new Promise((resolve) => {
            finishBulk = resolve;
          });
        return Promise.reject(new Error(`unexpected ${args.url}`));
      });
      renderTable();
      await screen.findByText('Sim 1');
      const tableArea = screen.getByRole('table').parentElement as HTMLElement;
      expect(tableArea).toHaveAttribute('aria-busy', 'false');

      fireEvent.click(
        screen.getByRole('button', { name: 'Mark all reviewed' })
      );

      await waitFor(() =>
        expect(tableArea).toHaveAttribute('aria-busy', 'true')
      );
      // No skeleton: the rows stay while the review and refresh run.
      expect(screen.getByText('Sim 1')).toBeInTheDocument();
      expect(screen.queryByText('Loading reports')).not.toBeInTheDocument();

      finishBulk({
        data: {
          message: 'ok',
          data: { updatedIds: ['r1', 'r2'], notAccessibleIds: [] },
        },
      });
      await waitFor(() =>
        expect(tableArea).toHaveAttribute('aria-busy', 'false')
      );
      expect(screen.getByText('Sim 1')).toBeInTheDocument();
    });
  });

  describe('review status filter and URL state', () => {
    const urlParams = () => new URLSearchParams(window.location.search);

    it('filters on the server and writes the filter to the URL', async () => {
      renderTable();
      await screen.findByText('Sim 1');
      expect(
        screen.getByRole('group', { name: 'Review status' })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
      await waitFor(() =>
        expect(lastListParams()).toMatchObject({
          reviewStatus: 'unread',
          page: 1,
        })
      );
      expect(urlParams().get('reportsClass')).toBe('class-1');
      expect(urlParams().get('reportStatus')).toBe('unread');

      fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }));
      await waitFor(() =>
        expect(lastListParams()).toMatchObject({ reviewStatus: 'read' })
      );

      // Back to All: the unfiltered page is served from the RTK Query cache.
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      await waitFor(() => expect(urlParams().get('reportStatus')).toBeNull());
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(callsTo(LIST).map((c) => c.params?.['reviewStatus'])).toEqual([
        undefined,
        'unread',
        'read',
      ]);
    });

    it('keeps the filter and sort when loading the next page', async () => {
      listReply = twoPages;
      renderTable();
      await screen.findByText('Sim 1');

      fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
      fireEvent.click(screen.getByText('Score'));
      await waitFor(() =>
        expect(lastListParams()).toMatchObject({
          reviewStatus: 'unread',
          sortBy: 'score',
          page: 1,
        })
      );
      await screen.findByText('Sim 1');
      loadMore();

      await waitFor(() =>
        expect(lastListParams()).toEqual({
          classIds: ['class-1'],
          reviewStatus: 'unread',
          sortBy: 'score',
          sortDirection: 'ASC',
          page: 2,
          pageSize: 10,
        })
      );
      expect(Object.fromEntries(urlParams())).toEqual({
        reportsClass: 'class-1',
        reportStatus: 'unread',
        reportSort: 'score',
        reportDir: 'asc',
      });
    });

    it('restores filter and sort from the URL, from the first page', async () => {
      window.history.replaceState(
        null,
        '',
        '/classes?reportsClass=class-1&reportStatus=read&reportSort=studentCode&reportDir=asc'
      );
      renderTable();

      await waitFor(() =>
        expect(lastListParams()).toEqual({
          classIds: ['class-1'],
          reviewStatus: 'read',
          sortBy: 'studentCode',
          sortDirection: 'ASC',
          page: 1,
          pageSize: 10,
        })
      );
      expect(screen.getByRole('button', { name: 'Reviewed' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('ignores URL state meant for another class or with bad values', async () => {
      window.history.replaceState(
        null,
        '',
        '/classes?reportsClass=class-9&reportStatus=unread'
      );
      const { unmount } = renderTable();
      await waitFor(() =>
        expect(lastListParams()).toMatchObject({
          page: 1,
          sortBy: 'completedAt',
        })
      );
      expect(lastListParams()).not.toHaveProperty('reviewStatus');
      unmount();

      window.history.replaceState(
        null,
        '',
        '/classes?reportsClass=class-1&reportStatus=bogus&reportSort=nope'
      );
      renderTable();
      await waitFor(() =>
        expect(lastListParams()).toEqual({
          classIds: ['class-1'],
          sortBy: 'completedAt',
          sortDirection: 'DESC',
          page: 1,
          pageSize: 10,
        })
      );
    });

    it('falls back to newest first for the removed Student Name sort', async () => {
      window.history.replaceState(
        null,
        '',
        '/classes?reportsClass=class-1&reportSort=studentName&reportDir=asc'
      );
      renderTable();
      await waitFor(() =>
        expect(lastListParams()).toMatchObject({
          sortBy: 'completedAt',
          sortDirection: 'ASC',
        })
      );
    });

    it('clears the selection when the filter changes', async () => {
      renderTable();
      await screen.findByText('Sim 1');
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Select report .*Sim 1/ })
      );
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

      await waitFor(() =>
        expect(screen.getByText('0 selected')).toBeInTheDocument()
      );
    });

    it('shows a "no matches" empty state for a filter with no results', async () => {
      listReply = (params) =>
        params['reviewStatus']
          ? { message: 'ok', data: [], meta: meta(1, 0, 0) }
          : { message: 'ok', data: [row(1)], meta: meta(1, 1, 1) };
      renderTable();
      await screen.findByText('Sim 1');

      fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }));

      expect(
        await screen.findByText('No reports match this filter.')
      ).toBeInTheDocument();
      // The filter stays available so it can be changed back.
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });
  });
});
