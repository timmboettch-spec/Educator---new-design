import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { StudentSummaryResDto } from '../../../src/redux/api/students/students.types';
import { StudentCodeStatus } from '../../../src/redux/api/students/students.types';
import { SKELETON_INITIAL_ROW_COUNT } from '../../../src/utils/constants/skeleton';
const review = vi.fn();
vi.mock('../../../src/hooks/useBulkReportReview', () => ({
  useBulkReportReview: () => ({ review, isReviewing: false }),
}));

const useGetClassRosterInfiniteQuery = vi.fn();
vi.mock('../../../src/redux/api/students/studentsApi', () => ({
  useGetClassRosterInfiniteQuery: (...args: unknown[]) =>
    useGetClassRosterInfiniteQuery(...args),
}));

import '../../../src/i18n';
import StudentSubTable from '../../../src/components/class/student/Studentsubtable';
import type { ClassAvailability } from '../../../src/utils/classUtils';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');

  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('../../../src/components/class/simulation/ExportReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-report-modal">
      <button onClick={onClose}>Close Export</button>
    </div>
  ),
}));

vi.mock(
  '../../../src/components/class/student/StudentEmailAccessCodeModal',
  () => ({
    default: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="email-access-code-modal">
        <button onClick={onClose}>Close Email Access</button>
      </div>
    ),
  })
);

vi.mock(
  '../../../src/components/class/student/StudentEmailReportModal',
  () => ({
    default: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="email-report-modal">
        <button onClick={onClose}>Close Email Report</button>
      </div>
    ),
  })
);

// The real modal frame (focus trap, Escape, focus restore) around the props the row passes.
vi.mock(
  '../../../src/components/class/student/StudentReportsModal',
  async () => {
    const { default: Modal } = await vi.importActual<
      typeof import('../../../src/components/ui/Modal')
    >('../../../src/components/ui/Modal');
    return {
      default: ({
        studentId,
        studentCode,
        classId,
        className,
        schoolName,
        onClose,
      }: {
        studentId: string;
        studentCode: string;
        classId?: string;
        className?: string;
        schoolName?: string;
        onClose: () => void;
      }) => (
        <Modal isOpen onClose={onClose} title={`Reports for ${studentCode}`}>
          <p>School: {schoolName}</p>
          <p>Class: {className}</p>
          <p>Student Code: {studentCode}</p>
          <p>
            ids: {classId}/{studentId}
          </p>
        </Modal>
      ),
    };
  }
);

vi.mock('../../../src/components/class/PrintAccessCode', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="print-access-code-modal">
        <button onClick={onClose}>Close Print</button>
      </div>
    ) : null,
}));

vi.mock(
  '../../../src/components/class/student/RegenerateAccessCodeModal',
  () => ({
    default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
      isOpen ? (
        <div data-testid="regenerate-modal">
          <button onClick={onClose}>Close Regen</button>
        </div>
      ) : null,
  })
);

vi.mock('../../../src/components/class/student/RevokeAccessCodeModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="revoke-modal">
        <button onClick={onClose}>Close Revoke</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/components/class/student/StudentModal', () => ({
  default: ({
    isOpen,
    onClose,
    onSuccess,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
  }) =>
    isOpen ? (
      <div data-testid="student-modal">
        <button onClick={onClose}>Close Student Modal</button>
        <button onClick={onSuccess}>Confirm Success</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  selectClassReports: () => [],
  GetClassSimulationReports: vi.fn(() => ({ type: 'reports/getClass' })),
}));

vi.mock('../../../src/redux/reports/EducatorReportsRedux', () => ({
  selectEducatorReports: () => [],
  selectEducatorReportsStatus: () => 'idle',
  GetEducatorSimulationReports: vi.fn(() => ({
    type: 'educatorReports/fetch',
  })),
}));

const STABLE_STUDENT_CODES = new Set<string>();

vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  selectAllStudentCodes: () => STABLE_STUDENT_CODES,
  selectNewReportsByUserId: () => ({}),
}));

vi.mock('../../../src/redux/local-db/LocalDbRedux', () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: 'localDb/fetchStatus' })),
  fetchStudentsByClass: vi.fn(() => ({ type: 'localDb/fetchStudentsByClass' })),
  selectIsLocalDbConnected: () => true,
  selectIsLocalDbConfigured: () => true,
  selectStudentDetails: () => [],
  selectClassStudentsState: () => ({ status: 'idle' }),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  default: () => null,
}));

function buildStore() {
  return configureStore({ reducer: { noop: () => ({}) } });
}

function makeSummary(
  overrides: Partial<StudentSummaryResDto> = {}
): StudentSummaryResDto {
  return {
    id: 'stu-1',
    studentId: 'CODE-001',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    classId: 'class-42',
    schoolId: 'school-1',
    status: 'ACTIVE',
    isActive: true,
    submissionDate: '2024-01-20',
    simsCompleted: '3',
    score: 85,
    timeSpent: '02:30:00',
    timeRemaining: '00:45:10',
    reportsCount: 2,
    codeStatus: StudentCodeStatus.ACTIVE,
    ...overrides,
  };
}

const refetch = vi.fn();
const fetchNextPage = vi.fn();

/** The generated hook's result for a loaded roster (one page per array). */
function mockRoster(
  pages: StudentSummaryResDto[][],
  overrides: Record<string, unknown> = {}
) {
  useGetClassRosterInfiniteQuery.mockReturnValue({
    currentData: {
      pages: pages.map((data, index) => ({
        data,
        meta: {
          total: pages.flat().length,
          page: index + 1,
          pageSize: 10,
          totalPages: pages.length,
          hasNextPage: false,
          hasPrevPage: index > 0,
        },
      })),
    },
    isFetching: false,
    isError: false,
    direction: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
    ...overrides,
  });
}

const DEFAULT_PROPS = {
  classId: 'class-42',
  className: 'Biology 101',
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  onStudentAdded: vi.fn(),
};

function renderComponent(
  props: Partial<typeof DEFAULT_PROPS> & {
    schoolName?: string;
    availability?: ClassAvailability;
  } = {}
) {
  return render(
    <Provider store={buildStore()}>
      <StudentSubTable {...DEFAULT_PROPS} {...props} />
    </Provider>
  );
}

const lastQueryArg = () => useGetClassRosterInfiniteQuery.mock.lastCall?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  mockRoster([[]]);
});

afterEach(() => {
  cleanup();
});

describe('StudentSubTable', () => {
  describe('States', () => {
    it('renders all table headers', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();

      [
        'Student Code',
        'Student Name',
        'Time Spent',
        'Time Remaining',
        'Sims Completed',
        'Avg Score',
        'Reports / Transcripts',
        'Student Code Status',
        'Actions',
      ].forEach((header) => {
        expect(
          screen.getByRole('columnheader', { name: header })
        ).toBeInTheDocument();
      });
    });

    it('shows a page of skeleton rows while the first page loads', () => {
      mockRoster([], { currentData: undefined, isFetching: true });
      renderComponent();

      expect(screen.getByRole('status')).toHaveTextContent('Loading students…');
      // The header row plus the initial skeleton rows.
      expect(screen.getAllByRole('row')).toHaveLength(
        1 + SKELETON_INITIAL_ROW_COUNT
      );
    });

    it('shows the unavailable state with a Retry when the roster fails', () => {
      mockRoster([], { currentData: undefined, isError: true });
      renderComponent();

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load students."
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalled();
    });

    it('shows empty-state message when no students', () => {
      renderComponent();

      expect(
        screen.getByText('No student added to this class yet.')
      ).toBeInTheDocument();
    });

    it('keeps the empty state while a refresh of the empty roster runs', () => {
      mockRoster([[]], { isFetching: true });
      renderComponent();

      expect(
        screen.getByText('No student added to this class yet.')
      ).toBeInTheDocument();
    });

    it('shows the unavailable state with a Retry when a refresh of the empty roster fails', () => {
      // A refetch (e.g. after a tag invalidation) failed; the cached roster is empty.
      mockRoster([[]], { isError: true });
      renderComponent();

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load students."
      );
      expect(
        screen.queryByText('No student added to this class yet.')
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('renders Add Student button', () => {
      renderComponent();

      expect(screen.getByText('＋ Add Student')).toBeInTheDocument();
    });

    it('disables Add Student once the class has ended, and says why', () => {
      renderComponent({ availability: 'ended' });
      const button = screen.getByRole('button', { name: /Add Student/ });

      expect(button).toBeDisabled();
      fireEvent.mouseEnter(button.parentElement as HTMLElement);
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        "This class has ended, so students can't be added to it."
      );
    });

    it('keeps Add Student enabled for an inactive class, with a note', () => {
      renderComponent({ availability: 'inactive' });
      const button = screen.getByRole('button', { name: /Add Student/ });

      expect(button).toBeEnabled();
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        "This class is inactive. Students can't access it until it's active."
      );
    });
  });

  describe('Full roster', () => {
    it('requests the class roster and shows every loaded page without paging', () => {
      mockRoster([
        [makeSummary()],
        [makeSummary({ id: 'stu-2', studentId: 'CODE-002' })],
      ]);
      renderComponent();

      expect(lastQueryArg()).toEqual({ pageSize: 10, classIds: ['class-42'] });
      expect(screen.getByText('CODE-001')).toBeInTheDocument();
      expect(screen.getByText('CODE-002')).toBeInTheDocument();
      expect(
        screen.getByText('All students in this class are shown.')
      ).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('keeps the loaded rows and adds one skeleton row while the next page loads', () => {
      mockRoster([[makeSummary()]], {
        hasNextPage: true,
        isFetchingNextPage: true,
      });
      renderComponent();

      expect(screen.getByText('CODE-001')).toBeInTheDocument();
      // Header, the loaded student, and one skeleton row.
      expect(screen.getAllByRole('row')).toHaveLength(3);
      // Announced once, by the skeleton row; the footer's text is hidden.
      expect(screen.getAllByText('Loading more…')).toHaveLength(1);
    });

    it('offers a Retry when the next page fails', () => {
      mockRoster([[makeSummary()]], {
        isError: true,
        direction: 'forward',
        hasNextPage: true,
      });
      renderComponent();

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load more."
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(fetchNextPage).toHaveBeenCalled();
    });
  });

  describe('Deep links', () => {
    const renderWithReportsLink = (studentId: string) =>
      render(
        <Provider store={buildStore()}>
          <StudentSubTable
            {...DEFAULT_PROPS}
            defaultReportsStudentId={studentId}
          />
        </Provider>
      );

    it('opens the target student when it is in the loaded rows', () => {
      mockRoster([[makeSummary()]], { hasNextPage: true });
      renderWithReportsLink('stu-1');

      expect(
        screen.getByRole('dialog', { name: 'Reports for CODE-001' })
      ).toBeInTheDocument();
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('loads the next page while the target student is not loaded yet', () => {
      mockRoster([[makeSummary()]], { hasNextPage: true });
      renderWithReportsLink('stu-15');

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('waits for the page already loading instead of requesting another', () => {
      mockRoster([[makeSummary()]], {
        hasNextPage: true,
        isFetchingNextPage: true,
      });
      renderWithReportsLink('stu-15');

      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('opens the target student once a later page brings it in', () => {
      mockRoster([[makeSummary()]], { hasNextPage: true });
      const { rerender } = renderWithReportsLink('stu-15');

      mockRoster([
        [makeSummary()],
        [makeSummary({ id: 'stu-15', studentId: 'CODE-015' })],
      ]);
      rerender(
        <Provider store={buildStore()}>
          <StudentSubTable
            {...DEFAULT_PROPS}
            defaultReportsStudentId="stu-15"
          />
        </Provider>
      );

      expect(
        screen.getByRole('dialog', { name: 'Reports for CODE-015' })
      ).toBeInTheDocument();
    });

    it('stops when the roster runs out or the next page fails', () => {
      mockRoster([[makeSummary()]], { hasNextPage: false });
      const { unmount } = renderWithReportsLink('stu-missing');
      expect(fetchNextPage).not.toHaveBeenCalled();
      unmount();

      mockRoster([[makeSummary()]], {
        hasNextPage: true,
        isError: true,
        direction: 'forward',
      });
      renderWithReportsLink('stu-missing');
      // Only the footer's Retry may load it again, so a broken page can't loop.
      expect(fetchNextPage).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Student code status and review actions', () => {
    it('shows the code status from the roster for every student', () => {
      mockRoster([
        [
          makeSummary(),
          makeSummary({
            id: 'stu-2',
            studentId: 'CODE-002',
            codeStatus: StudentCodeStatus.REVOKED,
          }),
        ],
      ]);
      renderComponent();

      // The design's uppercase chip replaces the badge's default tint.
      const active = screen.getByText('Active');
      expect(active).toHaveClass('uppercase', 'bg-green-100', 'text-green-800');
      expect(active).not.toHaveClass('bg-green-50');
      expect(screen.getByText('Revoked')).toHaveClass(
        'uppercase',
        'bg-red-100',
        'text-red-800'
      );
    });

    it('disables code actions for a revoked student', () => {
      mockRoster([[makeSummary({ codeStatus: StudentCodeStatus.REVOKED })]]);
      renderComponent();
      fireEvent.click(screen.getByText('···'));

      expect(screen.getByText('Revoke Student Code')).toBeDisabled();
      expect(screen.getByText('Regenerate Student Code')).toBeEnabled();
    });

    it.each([
      ['Mark All Reports Reviewed', true],
      ['Mark All Reports Unreviewed', false],
    ])('"%s" bulk-reviews the student', (label, reviewed) => {
      mockRoster([[makeSummary()]]);
      renderComponent();
      fireEvent.click(screen.getByText('···'));
      expect(
        screen.getByText('View Reports / Transcripts')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText(label));

      expect(review).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'student',
          ids: ['stu-1'],
          reviewed,
          classId: 'class-42',
        })
      );
    });
  });

  describe('Reports modal', () => {
    const reportsButton = () =>
      screen.getByRole('button', { name: 'Reports / Transcripts' });

    it("opens the student's Reports modal with the school, class and code", () => {
      mockRoster([[makeSummary()]]);
      renderComponent({ schoolName: 'Black Rock School' });
      fireEvent.click(reportsButton());

      const dialog = screen.getByRole('dialog', {
        name: 'Reports for CODE-001',
      });
      expect(dialog).toHaveTextContent('School: Black Rock School');
      expect(dialog).toHaveTextContent('Class: Biology 101');
      expect(dialog).toHaveTextContent('Student Code: CODE-001');
      expect(dialog).toHaveTextContent('ids: class-42/stu-1');
    });

    it('opens the same modal from "View Reports / Transcripts" in the Actions menu', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();
      fireEvent.click(screen.getByText('···'));
      fireEvent.click(screen.getByText('View Reports / Transcripts'));

      expect(
        screen.getByRole('dialog', { name: 'Reports for CODE-001' })
      ).toBeInTheDocument();
    });

    it('closes on Escape and returns focus to the button that opened it', async () => {
      mockRoster([[makeSummary()]]);
      renderComponent();
      const opener = reportsButton();
      opener.focus();
      fireEvent.click(opener);
      // Focus moves into the dialog first, so closing really has to restore it.
      await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(opener).toHaveFocus();
    });

    it('closes with ✕ and returns focus to the button that opened it', async () => {
      mockRoster([[makeSummary()]]);
      renderComponent();
      const opener = reportsButton();
      opener.focus();
      fireEvent.click(opener);
      await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(opener).toHaveFocus();
    });

    it('makes one review request and does not refetch the roster when Mark All fails', async () => {
      review.mockResolvedValueOnce(false);
      mockRoster([[makeSummary()]]);
      renderComponent();
      fireEvent.click(screen.getByText('···'));
      fireEvent.click(screen.getByText('Mark All Reports Reviewed'));

      await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
      expect(refetch).not.toHaveBeenCalled();
    });

    it('shows a gray Reports / Transcripts button', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();

      expect(reportsButton()).toHaveClass('bg-gray-50', 'text-gray-600');
      expect(reportsButton()).not.toHaveClass('bg-primary-500');
    });
  });

  describe('Student rows', () => {
    it('renders the backend values', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();

      expect(screen.getByText('CODE-001')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('2h 30m')).toBeInTheDocument();
      expect(screen.getByText('45m 10s')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reports / Transcripts' })
      ).toBeInTheDocument();
      expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    });

    it('shows a dash for values the backend has none for', () => {
      mockRoster([
        [
          makeSummary({
            timeSpent: null,
            timeRemaining: null,
            score: null,
            simsCompleted: null,
          }),
        ],
      ]);
      renderComponent();

      expect(screen.getAllByText('-')).toHaveLength(4);
    });

    it('hides the name column when no student has a name', () => {
      mockRoster([[makeSummary({ name: null })]]);
      renderComponent();

      expect(
        screen.queryByRole('columnheader', { name: 'Student Name' })
      ).not.toBeInTheDocument();
    });

    it('applies green style for completed sims > 0', () => {
      mockRoster([[makeSummary({ simsCompleted: '5' })]]);
      renderComponent();

      expect(screen.getByText('5')).toHaveClass('text-green-600');
    });

    it('applies gray style for completed sims = 0', () => {
      mockRoster([[makeSummary({ simsCompleted: '0' })]]);
      renderComponent();

      expect(screen.getByText('0')).toHaveClass('text-gray-500');
    });
  });

  describe('Sorting', () => {
    it.each([
      ['Student Code', 'studentCode'],
      ['Student Name', 'name'],
      ['Time Spent', 'timeSpent'],
      ['Time Remaining', 'timeRemaining'],
      ['Sims Completed', 'simsCompleted'],
      ['Avg Score', 'score'],
      ['Reports / Transcripts', 'reports'],
      ['Student Code Status', 'codeStatus'],
    ])('sorts by %s on the server', (label, sortBy) => {
      mockRoster([[makeSummary()]]);
      renderComponent();

      fireEvent.click(
        screen.getByRole('button', { name: `${label}, not sorted` })
      );

      expect(lastQueryArg()).toEqual({
        pageSize: 10,
        classIds: ['class-42'],
        sortBy,
        sortDir: 'asc',
      });
      expect(screen.getByRole('columnheader', { name: label })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
    });

    it('cycles ascending → descending → back to the backend default', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();
      const header = () =>
        screen.getByRole('columnheader', { name: 'Avg Score' });

      expect(header()).toHaveAttribute('aria-sort', 'none');
      fireEvent.click(
        screen.getByRole('button', { name: 'Avg Score, not sorted' })
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Avg Score, sorted ascending' })
      );
      expect(lastQueryArg()).toMatchObject({
        sortBy: 'score',
        sortDir: 'desc',
      });
      expect(header()).toHaveAttribute('aria-sort', 'descending');

      fireEvent.click(
        screen.getByRole('button', { name: 'Avg Score, sorted descending' })
      );
      expect(lastQueryArg()).toEqual({ pageSize: 10, classIds: ['class-42'] });
      expect(header()).toHaveAttribute('aria-sort', 'none');
    });

    it('leaves the Actions column unsortable', () => {
      mockRoster([[makeSummary()]]);
      renderComponent();

      expect(
        screen.getByRole('columnheader', { name: 'Actions' })
      ).not.toHaveAttribute('aria-sort');
    });
  });
});
