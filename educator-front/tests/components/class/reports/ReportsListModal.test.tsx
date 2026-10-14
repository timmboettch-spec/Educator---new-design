import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/redux/api', () => ({
  default: {
    request: vi.fn(() => new Promise(() => {})),
    get: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
  },
}));

const query = vi.hoisted(() => ({
  useGetReportsInfiniteQuery: vi.fn(),
}));
vi.mock(
  '../../../../src/redux/api/reports/reportsApi',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useGetReportsInfiniteQuery: query.useGetReportsInfiniteQuery,
  })
);

const review = vi.fn();
vi.mock('../../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

import { renderWithProviders } from '../../../../src/test/testUtils';
import { ReportsListModal } from '../../../../src/components/class/reports/ReportsListModal';

const row = (reportId: string, overrides: Record<string, unknown> = {}) => ({
  reportId,
  studentCode: `REP-${reportId}`,
  mode: 'Practice',
  simulationName: 'Cardiac Care',
  score: 70,
  performanceQuality: 'Needs Improvement',
  timeSpent: '00:05:00',
  completedAt: '2026-01-14T09:00:00.000Z',
  transcriptId: null,
  viewedAt: null,
  viewedBy: null,
  ...overrides,
});

const meta = (overrides: Record<string, unknown> = {}) => ({
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
  ...overrides,
});

const fetchNextPage = vi.fn();
const refetch = vi.fn();

const mockQuery = ({
  pages,
  ...state
}: { pages?: { data: unknown[]; meta: unknown }[] } & Record<
  string,
  unknown
>) =>
  query.useGetReportsInfiniteQuery.mockReturnValue({
    currentData: pages
      ? { pages, pageParams: pages.map((_, i) => i + 1) }
      : undefined,
    isFetching: false,
    isError: false,
    direction: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
    ...state,
  });

const lastQueryArgs = () =>
  query.useGetReportsInfiniteQuery.mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallback: ObserverCallback | null = null;
let observerOptions: IntersectionObserverInit | undefined;

const onViewReport = vi.fn();
const onViewTranscript = vi.fn();
const onClose = vi.fn();

// A student's reports: the case the shared modal is meant to serve next.
const renderModal = (props: Record<string, unknown> = {}) =>
  renderWithProviders(
    <ReportsListModal
      details={[
        { label: 'Student:', value: 'Ada Lovelace' },
        { label: 'Code:', value: undefined },
      ]}
      filter={{ classIds: ['class-1'], studentIds: ['stu-1'] }}
      classId="class-1"
      onViewReport={onViewReport}
      onViewTranscript={onViewTranscript}
      onClose={onClose}
      {...props}
    />
  );

describe('ReportsListModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    observerCallback = null;
    observerOptions = undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(
          callback: ObserverCallback,
          options?: IntersectionObserverInit
        ) {
          observerCallback = callback;
          observerOptions = options;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }
    );
    query.useGetReportsInfiniteQuery.mockReset();
    fetchNextPage.mockReset();
    refetch.mockReset();
    review.mockReset().mockResolvedValue(true);
    onViewReport.mockReset();
    onViewTranscript.mockReset();
    onClose.mockReset();
    mockQuery({ pages: [{ data: [row('r1'), row('r2')], meta: meta() }] });
  });

  it('shows the given details, hiding empty ones', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Reports' });
    expect(dialog).toHaveTextContent('Student: Ada Lovelace');
    expect(dialog).not.toHaveTextContent('Code:');
  });

  it('shows skeleton rows on the first load', () => {
    mockQuery({ isFetching: true });
    renderModal();
    expect(
      within(screen.getByRole('table')).getByRole('status')
    ).toHaveTextContent('Loading reports');
  });

  it('shows the error, not the empty state, when a refresh of an empty result fails', () => {
    mockQuery({
      pages: [{ data: [], meta: meta({ total: 0 }) }],
      isError: true,
    });
    renderModal();
    expect(
      screen.getByText("We couldn't load reports right now. Please try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText('No reports found')).not.toBeInTheDocument();
  });

  it('exposes the sort state on the column headers', () => {
    renderModal();
    const header = (name: RegExp) => screen.getByRole('columnheader', { name });
    expect(header(/Completed At/)).toHaveAttribute('aria-sort', 'descending');
    expect(header(/Score/)).toHaveAttribute('aria-sort', 'none');
    expect(header(/Performance Quality/)).not.toHaveAttribute('aria-sort');

    fireEvent.click(screen.getByRole('button', { name: /Score/ }));

    expect(header(/Score/)).toHaveAttribute('aria-sort', 'ascending');
    expect(header(/Completed At/)).toHaveAttribute('aria-sort', 'none');
  });

  it('keeps the toolbar busy until a custom Mark all finishes', async () => {
    let finish: (ok: boolean) => void = () => {};
    const onMarkAll = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    renderModal({ onMarkAll });

    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    expect(onMarkAll).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole('button', { name: 'Mark all unreviewed' })
    ).toBeDisabled();
    // A second click while it runs sends nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));
    expect(onMarkAll).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));

    expect(
      screen.getByRole('button', { name: 'Mark all unreviewed' })
    ).toBeEnabled();
  });

  it('uses a custom empty-state subtitle when given', () => {
    mockQuery({ pages: [{ data: [], meta: meta({ total: 0 }) }] });
    renderModal({ emptySubtitle: 'Nothing for this student yet.' });
    expect(screen.getByText('No reports found')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing for this student yet.')
    ).toBeInTheDocument();
  });

  it('uses a custom title when given', () => {
    renderModal({ title: 'Student reports' });
    expect(
      screen.getByRole('dialog', { name: 'Student reports' })
    ).toBeInTheDocument();
  });

  it('hides selection and bulk review when review is off', () => {
    renderModal({ canReview: false });
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('requests the filtered reports, newest first, without a page', () => {
    renderModal();
    expect(lastQueryArgs()).toEqual({
      pageSize: 10,
      classIds: ['class-1'],
      studentIds: ['stu-1'],
      sortBy: 'completedAt',
      sortDirection: 'DESC',
    });
  });

  it('hands row actions to the caller and renders extra actions', () => {
    renderModal({
      renderRowExtraActions: (r: { reportId: string }) => (
        <span>extra-{r.reportId}</span>
      ),
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'View Report' })[0]!);
    expect(onViewReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'r1' })
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'View Transcript' })[1]!
    );
    expect(onViewTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'r2' })
    );
    expect(screen.getByText('extra-r1')).toBeInTheDocument();
  });

  it('falls back to the given simulation name for a row without one', () => {
    mockQuery({
      pages: [{ data: [row('r1', { simulationName: '' })], meta: meta() }],
    });
    renderModal({ fallbackSimulationName: 'Fallback Sim' });
    expect(screen.getByText('Fallback Sim')).toBeInTheDocument();
  });

  it('marks all through the class by default', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));
    await waitFor(() =>
      expect(review).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'class',
          ids: ['class-1'],
          reviewed: true,
        })
      )
    );
  });

  it('scrolls inside its own box with a sticky header, and loads more within it', () => {
    mockQuery({
      pages: [{ data: [row('r1')], meta: meta({ hasNextPage: true }) }],
      hasNextPage: true,
    });
    renderModal();
    const table = screen.getByRole('table');
    const box = table.parentElement as HTMLElement;
    expect(box).toHaveClass('overflow-auto');
    expect(box.className).toMatch(/max-h-/);
    expect(table.querySelector('thead')).toHaveClass('sticky');
    expect(observerOptions?.root).toBe(box);

    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton rows below the loaded rows while the next page loads, then the end', () => {
    mockQuery({
      pages: [{ data: [row('r1')], meta: meta({ hasNextPage: true }) }],
      hasNextPage: true,
      isFetching: true,
      isFetchingNextPage: true,
    });
    const { rerender } = renderModal();
    const table = screen.getByRole('table');
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(within(table).getByRole('status')).toHaveTextContent(
      'Loading reports'
    );
    expect(screen.queryByText('Loading more…')).not.toBeInTheDocument();

    mockQuery({ pages: [{ data: [row('r1')], meta: meta() }] });
    rerender(
      <ReportsListModal
        details={[]}
        filter={{ classIds: ['class-1'], studentIds: ['stu-1'] }}
        classId="class-1"
        onViewReport={onViewReport}
        onViewTranscript={onViewTranscript}
        onClose={onClose}
      />
    );
    expect(screen.getByText('All reports are shown.')).toBeInTheDocument();
  });

  it('pauses loading more while a retried refresh runs, then resumes', () => {
    const props = {
      details: [],
      filter: { classIds: ['class-1'], studentIds: ['stu-1'] },
      classId: 'class-1',
      onViewReport,
      onViewTranscript,
      onClose,
    };
    const loaded = {
      pages: [{ data: [row('r1')], meta: meta({ hasNextPage: true }) }],
      hasNextPage: true,
    };
    // A refresh (no direction) failed: the footer offers Retry.
    mockQuery({ ...loaded, isError: true });
    const { rerender } = renderModal();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // Retry clears the error while the refresh is still running; with the
    // sentinel already in view, loading more must wait for it to finish.
    mockQuery({ ...loaded, isFetching: true });
    rerender(<ReportsListModal {...props} />);
    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).not.toHaveBeenCalled();

    // The refresh finished: the observer is re-armed and loads the next page.
    mockQuery(loaded);
    rerender(<ReportsListModal {...props} />);
    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded rows and offers a retry when the next page fails', () => {
    mockQuery({
      pages: [{ data: [row('r1')], meta: meta({ hasNextPage: true }) }],
      hasNextPage: true,
      isError: true,
      direction: 'forward',
    });
    renderModal();
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load more.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('keeps the rows during a background refresh instead of showing skeletons', () => {
    mockQuery({
      pages: [{ data: [row('r1')], meta: meta() }],
      isFetching: true,
    });
    renderModal();
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(screen.queryByText('Loading reports…')).not.toBeInTheDocument();
    expect(screen.getByRole('table').parentElement).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
