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

const review = vi.fn();
vi.mock('../../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

import { renderWithProviders } from '../../../../src/test/testUtils';
import StudentReportsModal from '../../../../src/components/class/student/StudentReportsModal';

const row = (reportId: string, overrides: Record<string, unknown> = {}) => ({
  reportId,
  studentCode: 'STU-1',
  mode: 'Assessment',
  simulationName: 'Cardiac Care',
  score: 80,
  performanceQuality: 'Meets Expectation',
  timeSpent: '00:01:00',
  completedAt: '2026-07-09T10:05:00.000Z',
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
    refetch: vi.fn(),
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
const renderModal = (
  { classId }: { classId?: string } = { classId: 'class-1' }
) =>
  renderWithProviders(
    <StudentReportsModal
      studentId="stu-uuid-1"
      studentName="Ava Patel"
      studentCode="STU-1"
      studentEmail="ava@example.com"
      classId={classId}
      className="Biology 101"
      schoolName="Black Rock School"
      onClose={onClose}
    />
  );

describe('StudentReportsModal', () => {
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
    review.mockReset().mockResolvedValue(true);
    mockNavigate.mockReset();
    onClose.mockReset();
    mockQuery({
      pages: [
        {
          data: [row('r1'), row('r2', { viewedAt: '2026-07-10' })],
          meta: meta(),
        },
      ],
    });
  });

  it('shows the school, class and student code it lists reports for', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Reports' });
    expect(dialog).toHaveTextContent('School: Black Rock School');
    expect(dialog).toHaveTextContent('Class: Biology 101');
    expect(dialog).toHaveTextContent('Student Code: STU-1');
    // The design shows the code, not the name.
    expect(dialog).not.toHaveTextContent('Ava Patel');
  });

  it("requests this student's reports in the class, newest first", () => {
    renderModal();
    expect(lastQueryArgs()).toEqual({
      pageSize: 10,
      classIds: ['class-1'],
      studentIds: ['stu-uuid-1'],
      sortBy: 'completedAt',
      sortDirection: 'DESC',
    });
  });

  it('requests every class of the student when no class is given', () => {
    renderModal({});
    expect(lastQueryArgs()).not.toHaveProperty('classIds');
    expect(lastQueryArgs()).toMatchObject({ studentIds: ['stu-uuid-1'] });
  });

  it('shows the student empty state when there are no reports', () => {
    mockQuery({
      pages: [{ data: [], meta: meta({ total: 0, totalPages: 0 }) }],
    });
    renderModal();
    expect(screen.getByText('No reports found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Completed simulation reports for this student will appear here.'
      )
    ).toBeInTheDocument();
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
    expect(lastQueryArgs()).toMatchObject({ sortDirection: 'DESC' });
  });

  describe('marking selected reports', () => {
    const markReviewed = () =>
      screen.getByRole('button', { name: 'Mark reviewed' });
    const markUnreviewed = () =>
      screen.getByRole('button', { name: 'Mark unreviewed' });

    it('is disabled with nothing selected', () => {
      renderModal();
      expect(markReviewed()).toBeDisabled();
      expect(markUnreviewed()).toBeDisabled();
    });

    it('select-all selects every loaded row and shows a partial state', () => {
      renderModal();
      const selectAll = screen.getByRole('checkbox', {
        name: 'Select all reports',
      });
      fireEvent.click(selectAll);
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      fireEvent.click(
        screen.getAllByRole('checkbox', { name: /^Select report / })[0]!
      );
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(selectAll).toHaveProperty('indeterminate', true);

      fireEvent.click(selectAll);
      fireEvent.click(selectAll);
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it.each([
      ['Mark reviewed', true],
      ['Mark unreviewed', false],
    ])(
      '"%s" updates only the selected reports, then clears the selection',
      async (label, reviewed) => {
        renderModal();
        fireEvent.click(
          screen.getAllByRole('checkbox', { name: /^Select report / })[1]!
        );
        fireEvent.click(screen.getByRole('button', { name: label }));

        await waitFor(() =>
          expect(review).toHaveBeenCalledWith({
            type: 'report',
            ids: ['r2'],
            reviewed,
            classId: 'class-1',
          })
        );
        await waitFor(() =>
          expect(screen.getByText('0 selected')).toBeInTheDocument()
        );
      }
    );

    it('keeps the selection when the review fails', async () => {
      review.mockResolvedValueOnce(false);
      renderModal();
      fireEvent.click(
        screen.getAllByRole('checkbox', { name: /^Select report / })[0]!
      );
      fireEvent.click(markReviewed());

      await waitFor(() => expect(review).toHaveBeenCalled());
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });
  });

  it('shows skeleton rows while the reports load', () => {
    mockQuery({ isFetching: true });
    renderModal();
    expect(
      within(screen.getByRole('table')).getByRole('status')
    ).toHaveTextContent('Loading reports');
  });

  it('loads the next page as the end of the table scrolls into view', () => {
    mockQuery({
      pages: [{ data: [row('r1')], meta: meta({ hasNextPage: true }) }],
      hasNextPage: true,
    });
    renderModal();
    act(() => observerCallback?.([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Mark all reviewed', true],
    ['Mark all unreviewed', false],
  ])('"%s" reviews every report of the student', async (label, reviewed) => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() =>
      expect(review).toHaveBeenCalledWith({
        type: 'student',
        ids: ['stu-uuid-1'],
        reviewed,
        classId: 'class-1',
      })
    );
  });

  it('keeps the selection when Mark all fails', async () => {
    review.mockResolvedValueOnce(false);
    renderModal();
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: /^Select report / })[0]!
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    await waitFor(() => expect(review).toHaveBeenCalled());
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('hides selection and bulk review without a class', () => {
    renderModal({});
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('opens a report and comes back to this modal', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: 'View Report' })[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      '/report-detail',
      expect.objectContaining({
        state: expect.objectContaining({
          report: expect.objectContaining({
            id: 'r1',
            class_id: 'class-1',
            student_name: 'Ava Patel',
            student_email: 'ava@example.com',
          }),
          backState: {
            classId: 'class-1',
            expandType: 'students',
            studentId: 'stu-uuid-1',
            openStudentReports: true,
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
        state: expect.objectContaining({ simulationName: 'Cardiac Care' }),
      })
    );
  });
});
