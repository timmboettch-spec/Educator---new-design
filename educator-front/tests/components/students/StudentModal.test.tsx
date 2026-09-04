import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import configureStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';

import type { Student } from '../../../src/types';

import StudentModal from '../../../src/components/class/student/StudentModal';
import StudentSubTable from '../../../src/components/class/student/Studentsubtable';

import {
  selectPostStudentLoading,
} from '../../../src/redux/class/Student/PostStudentRedux';

import {
  BulkPostStudentRequest,
} from '../../../src/redux/class/Student/BulkPostStudentRedux';

import { selectPutStudentLoading } from '../../../src/redux/class/Student/PatchStudentRedux';

import { selectDeleteStudentLoading } from '../../../src/redux/class/Student/DeleteStudentRedux';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('../../../src/redux/config', () => ({
  default: {
    StudentAPI: 'http://mock/api/students',
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/components/class/simulation/ExportReportModal', () => ({
  default: () => <div data-testid="export-report-modal" />,
}));

vi.mock('../../../src/components/class/student/StudentEmailReportModal', () => ({
  default: () => <div data-testid="email-report-modal" />,
}));

vi.mock('../../../src/components/class/student/StudentEmailAccessCodeModal', () => ({
  default: () => <div data-testid="email-access-modal" />,
}));

vi.mock('../../../src/components/class/PrintAccessCode', () => ({
  default: () => <div data-testid="print-access-modal" />,
}));

vi.mock('../../../src/components/class/student/RegenerateAccessCodeModal', () => ({
  default: () => <div data-testid="regenerate-modal" />,
}));

// RevokeAccessCodeModal is used in StudentSubTable but not in the original test file.
// Mock it to avoid import errors.
vi.mock('../../../src/components/class/student/RevokeAccessCodeModal', () => ({
  default: () => <div data-testid="revoke-modal" />,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

vi.mock('../../../src/redux/class/Student/PostStudentRedux', () => ({
  PostStudentRequest: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
  selectPostStudentLoading: vi.fn(() => false),
}));

vi.mock('../../../src/utils/studentCodeGenerator', () => ({
  generateUniqueStudentCode: vi.fn(() => '12345678'),
}));

vi.mock('../../../src/redux/class/Student/PatchStudentRedux', () => ({
  PutStudentRequest: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
  selectPutStudentLoading: vi.fn(() => false),
}));

vi.mock('../../../src/redux/class/Student/DeleteStudentRedux', () => ({
  DeleteStudentRequest: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
  selectDeleteStudentLoading: vi.fn(() => false),
}));

vi.mock('../../../src/redux/class/Student/UpdateStudentCodeRedux', () => ({
  selectUpdateCodeLoading: vi.fn(() => false),
  UpdateStudentCodeRequest: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../../src/redux/class/Student/BulkPostStudentRedux', () => ({
  BulkPostStudentRequest: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
  selectBulkPostStudentLoading: vi.fn(() => false),
  clearBulkPostStudentState: vi.fn(),
}));

vi.mock('../../../src/redux/local-db/LocalDbRedux', () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: 'localDb/fetchStatus' })),
  fetchStudentsByClass: vi.fn(() => ({ type: 'localDb/fetchStudentsByClass' })),
  selectIsLocalDbConnected: () => true,
  selectIsLocalDbConfigured: () => true,
  selectStudentDetails: () => [],
  selectClassStudentsState: () => ({ status: 'idle' }),
}));

vi.mock('../../../src/redux/class/StudentEmailAccessRedux', () => ({
  selectEmailAccessCodeLoading: vi.fn(() => false),
  selectEmailAccessCodeSuccess: vi.fn(() => false),
  selectEmailAccessCodeError: vi.fn(() => null),
  clearEmailAccessCodeState: vi.fn(),
  sendEmailAccessCode: vi.fn(),
}));

vi.mock('../../../src/redux/class/StudentEmailReportRedux', () => ({
  selectEmailReportLoading: vi.fn(() => false),
  selectEmailReportSuccess: vi.fn(() => false),
  selectEmailReportError: vi.fn(() => null),
  clearEmailReportState: vi.fn(),
  sendEmailReport: vi.fn(),
}));

// IMPORTANT: must be a stable reference — returning a new `{}` each call
// triggers React-Redux's "selector returned different result" warning and
// causes infinite re-renders in tests.
const STABLE_SIMS_COMPLETED: Record<string, number> = {};

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  selectSyncedSimsCompleted: () => STABLE_SIMS_COMPLETED,
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

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => (action: unknown) => {
    if (typeof action === 'function') {
      return action(vi.fn(), vi.fn());
    }
    return action;
  },
  useAppSelector: (selector: (...args: unknown[]) => unknown) => selector({}),
}));

/* -------------------------------------------------------------------------- */
/*                             WINDOW LOCATION FIX                            */
/* -------------------------------------------------------------------------- */

Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    ...window.location,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
});

/* -------------------------------------------------------------------------- */
/*                                   SETUP                                    */
/* -------------------------------------------------------------------------- */

const mockStore = configureStore([thunk]);

const baseStoreState = {
  simsCompletedReports: {
    studentReports: [],
    studentReportsStatus: 'idle',
    studentReportsError: null,
    classReports: [],
    classReportsStatus: 'idle',
    classReportsError: null,
    syncStatus: 'idle',
    syncError: null,
    syncedSimsCompleted: {},
  },
};

const setLoading = (post = false, put = false, del = false) => {
  vi.mocked(selectPostStudentLoading).mockReturnValue(post);
  vi.mocked(selectPutStudentLoading).mockReturnValue(put);
  vi.mocked(selectDeleteStudentLoading).mockReturnValue(del);
};

const mockStudent: Student = {
  id: 'stu-1',
  student_id: 'CODE001',
  student_name: 'Alice Johnson',
  email: 'alice@example.com',
  class_id: 'cls-1',
  score: 85,
  sims_completed: '3',
  time_spent: '2h',
  time_remaining: '1h',
};

const defaultModalProps = {
  isOpen: true,
  onClose: vi.fn(),
  classId: 'cls-1',
  className: 'Biology 101',
  onSuccess: vi.fn(),
};

const renderModal = (props = {}) =>
  render(
    <Provider store={mockStore(baseStoreState)}>
      <StudentModal {...defaultModalProps} {...props} />
    </Provider>,
  );

const renderSubTable = (students: Student[] = []) =>
  render(
    <Provider store={mockStore(baseStoreState)}>
      <StudentSubTable
        classId="cls-1"
        className="Biology 101"
        students={students}
        onStudentAdded={vi.fn()}
      />
    </Provider>,
  );

/* -------------------------------------------------------------------------- */
/*                               GLOBAL HOOKS                                 */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.clearAllMocks();
  setLoading();
});

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/*                          STUDENT MODAL – ADD MODE                          */
/* -------------------------------------------------------------------------- */

describe('StudentModal – Add Mode', () => {
  test('renders Add Student title and form fields', () => {
    renderModal();

    expect(screen.getByText('Add Student')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter number of students')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Biology 101')).toBeInTheDocument();
  });

  test('shows class name as disabled field', () => {
    renderModal();
    expect(screen.getByDisplayValue('Biology 101')).toBeDisabled();
  });

  test('shows validation error when student count is empty', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Create Student'));

    expect(await screen.findByText('Please enter a number of students (minimum 1)')).toBeInTheDocument();
  });

  test('does not call BulkPostStudentRequest when count is blank', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Create Student'));

    expect(BulkPostStudentRequest).not.toHaveBeenCalled();
  });

  test('calls BulkPostStudentRequest on valid submit', async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Enter number of students'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByText('Create Student'));

    await waitFor(() => {
      expect(BulkPostStudentRequest).toHaveBeenCalled();
    });
  });

  test('BulkPostStudentRequest payload contains class_id and count, not student_id', async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Enter number of students'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByText('Create Student'));

    await waitFor(() => {
      expect(BulkPostStudentRequest).toHaveBeenCalled();
      const call = vi.mocked(BulkPostStudentRequest).mock.calls[0][0];
      expect(call).not.toHaveProperty('student_id');
      expect(call).toHaveProperty('class_id', 'cls-1');
      expect(call).toHaveProperty('count', 3);
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                        STUDENT SUBTABLE – INTERACTIONS                     */
/* -------------------------------------------------------------------------- */

describe('StudentSubTable – Interactions', () => {
  /**
   * Helper: finds the ··· action button for a given student by locating the row
   * that contains the student's name and then finding the button within it.
   * This avoids relying on data-testid which doesn't exist in the component.
   */
  const getActionButton = () => {
    // There will be exactly one ··· button when one student is rendered
    return screen.getByText('···').closest('button') as HTMLElement;
  };

  const openActionMenu = async () => {
    const user = userEvent.setup();
    const actionButton = getActionButton();
    await user.click(actionButton);
    expect(await screen.findByText('Print Student Code')).toBeInTheDocument();
    return user;
  };

  test('opens Add Student modal on button click', async () => {
    const user = userEvent.setup();
    renderSubTable([mockStudent]);

    await user.click(screen.getByRole('button', { name: /add student/i }));

    expect(await screen.findByRole('heading', { name: 'Add Student' })).toBeInTheDocument();
  });

  test('opens action dropdown on dots button click', async () => {
    renderSubTable([mockStudent]);
    await openActionMenu();
    expect(screen.getByText('Print Student Code')).toBeInTheDocument();
  });

  test('action menu contains remaining options', async () => {
    renderSubTable([mockStudent]);
    await openActionMenu();

    const menuItems = [
      'Email Student Code',
      'Print Student Code',
      'Regenerate Student Code',
      'Revoke Student Code',
      'Email Reports',
      'Export Reports',
      'Delete Student',
    ];

    for (const item of menuItems) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByText('Edit Student Details')).not.toBeInTheDocument();
  });

  test.skip('clicking Edit Student Details opens edit modal', async () => {
    const user = userEvent.setup();
    renderSubTable([mockStudent]);

    await openActionMenu();
    await user.click(screen.getByText('Edit Student Details'));

    expect(await screen.findByRole('heading', { name: 'Edit Student' })).toBeInTheDocument();
  });

  test('clicking Delete Student opens delete confirm modal', async () => {
    const user = userEvent.setup();
    renderSubTable([mockStudent]);

    await openActionMenu();
    await user.click(screen.getByText('Delete Student'));

    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
  });

  test('clicking dots button again closes the dropdown', async () => {
    const user = userEvent.setup();
    renderSubTable([mockStudent]);

    const actionButton = getActionButton();

    await user.click(actionButton);
    expect(await screen.findByText('Print Student Code')).toBeInTheDocument();

    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.queryByText('Print Student Code')).not.toBeInTheDocument();
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                           STUDENT SUBTABLE – SORTING                       */
/* -------------------------------------------------------------------------- */

describe('StudentSubTable – Sorting', () => {
  const twoStudents: Student[] = [
    { ...mockStudent, id: 'stu-1', student_name: 'Zara', student_id: 'CODE001', score: 90 },
    { ...mockStudent, id: 'stu-2', student_name: 'Aaron', student_id: 'CODE002', score: 60 },
  ];

  test('sorts by student name ascending on first header click', async () => {
    const user = userEvent.setup();
    renderSubTable(twoStudents);

    await user.click(screen.getByText('Student Name'));

    const codeCells = screen
      .getAllByRole('cell')
      .filter((c) => ['CODE001', 'CODE002'].includes(c.textContent?.trim() ?? ''));

    // Ascending by student_name: Aaron < Zara, so Aaron (CODE002) comes first
    expect(codeCells[0].textContent?.trim()).toBe('CODE002');
  });

  test('sorts by student name descending on second header click', async () => {
    const user = userEvent.setup();
    renderSubTable(twoStudents);

    await user.click(screen.getByText('Student Name'));
    await user.click(screen.getByText('Student Name'));

    const codeCells = screen
      .getAllByRole('cell')
      .filter((c) => ['CODE001', 'CODE002'].includes(c.textContent?.trim() ?? ''));

    // Descending by student_name: Zara > Aaron, so Zara (CODE001) comes first
    expect(codeCells[0].textContent?.trim()).toBe('CODE001');
  });
});
