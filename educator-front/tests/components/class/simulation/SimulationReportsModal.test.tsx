import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/redux/api', () => ({
  default: {
    request: vi.fn(() => new Promise(() => {})),
    get: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => mockNavigate,
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

const markAll = vi.fn();
vi.mock('../../../../src/hooks/useMarkAllSimReports', () => ({
  useMarkAllSimReports: () => ({ markAll, isMarking: false }),
}));

const review = vi.fn();
vi.mock('../../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

import { renderWithProviders } from '../../../../src/test/testUtils';
import SimulationReportsModal from '../../../../src/components/class/simulation/SimulationReportsModal';

const row = (reportId: string, overrides: Record<string, unknown> = {}) => ({
  reportId,
  studentCode: `REP-${reportId}`,
  mode: 'Assessment',
  simulationName: 'Gastric Decompression via NG Tube',
  score: 82,
  performanceQuality: 'Exceptional',
  timeSpent: '00:12:34',
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

// The infinite query's result; `pages` are the loaded pages, in order.
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

const onClose = vi.fn();
const renderModal = () =>
  renderWithProviders(
    <SimulationReportsModal
      classId="class-1"
      className="Pediatric Nursing — Sec B"
      schoolName="Cedar Hollow Health Sciences Academy"
      simulationId="sim-lib-1"
      simName="Gastric Decompression via NG Tube"
      onClose={onClose}
    />
  );

describe('SimulationReportsModal', () => {
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
    query.useGetReportsInfiniteQuery.mockReset();
    fetchNextPage.mockReset();
    refetch.mockReset();
    markAll.mockReset().mockResolvedValue(true);
    review.mockReset().mockResolvedValue(true);
    mockNavigate.mockReset();
    onClose.mockReset();
    mockQuery({
      pages: [
        {
          data: [row('r1'), row('r2', { viewedAt: '2026-01-15' })],
          meta: meta(),
        },
      ],
    });
  });

  it('shows the school, class and simulation it lists reports for', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Reports' });
    expect(dialog).toHaveTextContent(
      'School: Cedar Hollow Health Sciences Academy'
    );
    expect(dialog).toHaveTextContent('Class: Pediatric Nursing — Sec B');
    expect(dialog).toHaveTextContent(
      'Simulation: Gastric Decompression via NG Tube'
    );
  });

  it("requests this class's reports for the catalog sim, newest first", () => {
    renderModal();
    expect(lastQueryArgs()).toEqual({
      pageSize: 10,
      classIds: ['class-1'],
      simulationIds: ['sim-lib-1'],
      sortBy: 'completedAt',
      sortDirection: 'DESC',
    });
  });

  it('renders the report columns and row values', () => {
    renderModal();
    [
      'Student Code',
      'Mode',
      'Simulation Name',
      'Score',
      'Performance Quality',
      'Time Spent',
      'Completed At',
      'View Reports / Transcripts',
    ].forEach((name) =>
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    );
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(screen.getAllByText('82%')).toHaveLength(2);
    expect(screen.getAllByText('12m 34s')).toHaveLength(2);
  });

  it('shows the loading state while reports load', () => {
    mockQuery({ isFetching: true });
    renderModal();
    expect(screen.getByRole('status')).toHaveTextContent('Loading reports…');
  });

  it('shows the empty state when the sim has no reports', () => {
    mockQuery({
      pages: [{ data: [], meta: meta({ total: 0, totalPages: 0 }) }],
    });
    renderModal();
    expect(screen.getByText('No reports found')).toBeInTheDocument();
    expect(
      screen.getByText('Completed simulation reports will appear here.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows a friendly error when the list fails', () => {
    mockQuery({ isError: true });
    renderModal();
    expect(
      screen.getByText("We couldn't load reports right now. Please try again.")
    ).toBeInTheDocument();
  });

  it('sorts server-side, toggling direction', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Score/ }));
    expect(lastQueryArgs()).toMatchObject({
      sortBy: 'score',
      sortDirection: 'ASC',
    });
    fireEvent.click(screen.getByRole('button', { name: /Score/ }));
    expect(lastQueryArgs()).toMatchObject({
      sortBy: 'score',
      sortDirection: 'DESC',
    });
  });

  it('loads the next page as the end of the table scrolls into view', () => {
    mockQuery({
      pages: [
        {
          data: [row('r1')],
          meta: meta({ total: 12, totalPages: 2, hasNextPage: true }),
        },
      ],
      hasNextPage: true,
    });
    renderModal();
    expect(screen.queryByText(/Results:/)).not.toBeInTheDocument();

    act(() => observerCallback?.([{ isIntersecting: true }]));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows every loaded page and the total in the bulk bar', () => {
    mockQuery({
      pages: [
        { data: [row('r1')], meta: meta({ total: 2, totalPages: 2 }) },
        { data: [row('r2')], meta: meta({ total: 2, page: 2, totalPages: 2 }) },
      ],
    });
    renderModal();
    expect(screen.getByText('REP-r1')).toBeInTheDocument();
    expect(screen.getByText('REP-r2')).toBeInTheDocument();
    expect(screen.getByText('All reports are shown.')).toBeInTheDocument();
  });

  it.each([
    ['Mark all reviewed', true],
    ['Mark all unreviewed', false],
  ])(
    '"%s" reviews only this class\'s reports for the sim',
    async (label, reviewed) => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(markAll).toHaveBeenCalledWith('class-1', 'sim-lib-1', reviewed)
      );
      expect(review).not.toHaveBeenCalled();
    }
  );

  it('marks selected reports by id', async () => {
    renderModal();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all reports' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() =>
      expect(review).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'report',
          ids: ['r1', 'r2'],
          reviewed: true,
          classId: 'class-1',
        })
      )
    );
  });

  it('opens a report and comes back to this modal', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: 'View Report' })[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      '/report-detail',
      expect.objectContaining({
        state: expect.objectContaining({
          report: expect.objectContaining({ id: 'r1', class_id: 'class-1' }),
          backState: {
            classId: 'class-1',
            expandType: 'sims',
            simId: 'sim-lib-1',
            openSimReports: true,
          },
        }),
      })
    );
  });

  it('opens the transcript', () => {
    renderModal();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'View Transcript' })[0]!
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/transcript/r1',
      expect.objectContaining({
        state: expect.objectContaining({
          simulationName: 'Gastric Decompression via NG Tube',
        }),
      })
    );
  });

  it('closes on Escape', () => {
    renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
