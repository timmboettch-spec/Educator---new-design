import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import type { Student } from '../../../src/types';
import StudentSubTable from '../../../src/components/class/student/Studentsubtable';

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

vi.mock('../../../src/components/class/student/StudentEmailAccessCodeModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="email-access-code-modal">
      <button onClick={onClose}>Close Email Access</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/student/StudentEmailReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="email-report-modal">
      <button onClick={onClose}>Close Email Report</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/PrintAccessCode', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="print-access-code-modal">
        <button onClick={onClose}>Close Print</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/components/class/student/RegenerateAccessCodeModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="regenerate-modal">
        <button onClick={onClose}>Close Regen</button>
      </div>
    ) : null,
}));

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
  selectSyncedSimsCompleted: (state: { simsCompleted: Record<string, number> }) =>
    state.simsCompleted,
  selectClassReports: () => [],
  GetClassSimulationReports: vi.fn(() => ({ type: 'reports/getClass' })),
}));

vi.mock('../../../src/redux/reports/EducatorReportsRedux', () => ({
  selectEducatorReports: () => [],
  selectEducatorReportsStatus: () => 'idle',
  GetEducatorSimulationReports: vi.fn(() => ({ type: 'educatorReports/fetch' })),
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
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

const STABLE_SIMS_COMPLETED: Record<string, number> = {};

function buildStore(simsCompleted: Record<string, number> = STABLE_SIMS_COMPLETED) {
  return configureStore({
    reducer: {
      simsCompleted: () => simsCompleted,
    },
  });
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu-1',
    student_id: 'CODE-001',
    student_name: 'Alice Johnson',
    email: 'alice@example.com',
    class_id: 'class-42',

    sims_completed: '3',

    time_spent: '2h 30m',
    time_remaining: '1h 00m',

    score: 85,

    created_at: new Date('2024-01-15T10:00:00Z'),

    submission_date: '2024-01-20T10:00:00Z',

    ...overrides,
  } as Student;
}

const DEFAULT_PROPS = {
  classId: 'class-42',
  className: 'Biology 101',
  startDate: '2024-01-01',
  endDate: '2024-06-30',

  students: [] as Student[],

  onStudentAdded: vi.fn(),
};

function renderComponent(
  props: Partial<typeof DEFAULT_PROPS> = {},
  simsCompleted: Record<string, number> = {},
) {
  const store = buildStore(simsCompleted);

  return render(
    <Provider store={store}>
      <StudentSubTable {...DEFAULT_PROPS} {...props} />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('StudentSubTable', () => {
  describe('Empty state', () => {
    it('renders all table headers', () => {
      renderComponent();

      const headers = [
        'Student Code',
        'Time Spent',
        'Time Remaining',
        'Sims Completed',
        'Avg Score',
        'Reports',
        'Actions',
      ];

      headers.forEach((header) => {
        expect(screen.getByText(header)).toBeInTheDocument();
      });
    });

    it('shows empty-state message when no students', () => {
      renderComponent({ students: [] });

      expect(screen.getByText('No student added to this class yet.')).toBeInTheDocument();
    });

    it('renders Add Student button', () => {
      renderComponent();

      expect(screen.getByText('＋ Add Student')).toBeInTheDocument();
    });
  });

  describe('Student rows', () => {
    it('renders student data correctly', () => {
      renderComponent({
        students: [makeStudent()],
      });

      expect(screen.getByText('CODE-001')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('2h 30m')).toBeInTheDocument();
      expect(screen.getByText('1h 00m')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('uses synced sims_completed value from Redux when available', () => {
      const student = makeStudent({
        id: 'stu-1',
        sims_completed: '2',
      });

      renderComponent(
        {
          students: [student],
        },
        {
          'stu-1': 7,
        },
      );

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('falls back to local sims_completed value', () => {
      const student = makeStudent({
        sims_completed: '4',
      });

      renderComponent({
        students: [student],
      });

      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('applies green style for completed sims > 0', () => {
      const student = makeStudent({
        sims_completed: '5',
      });

      renderComponent(
        {
          students: [student],
        },
        {
          'stu-1': 5,
        },
      );

      expect(screen.getByText('5')).toHaveClass('text-green-600');
    });

    it('applies gray style for completed sims = 0', () => {
      const student = makeStudent({
        sims_completed: '0',
      });

      renderComponent(
        {
          students: [student],
        },
        {
          'stu-1': 0,
        },
      );

      const zeros = screen.getAllByText('0');
      // First '0' is the simsCompleted span; the badge also renders '0' for report count
      const simsSpan = zeros.find(
        (el) => el.tagName === 'SPAN' && (el.className.includes('text-gray-500') || el.className.includes('text-green-600'))
      );
      expect(simsSpan).toHaveClass('text-gray-500');
    });
  });
});
