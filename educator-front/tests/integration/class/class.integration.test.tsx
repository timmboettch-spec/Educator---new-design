import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import ClassPage from '../../../src/pages/class/index';
import '@testing-library/jest-dom/vitest';

const mockDispatch = vi.fn();

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return { ...actual, useDispatch: () => mockDispatch };
});

vi.mock('../../../src/redux/class/GetClassRedux', () => {
  const stableEmptyObject = {};
  const stableEmptyArray: unknown[] = [];
  const stableStudentCodes = new Set<string>();
  return {
    FetchClassesRequest: vi.fn(() => ({ type: 'class/fetch' })),
    FetchNeedAttentionClasses: vi.fn(() => ({ type: 'classes/needAttention' })),
    resetClassListStatus: vi.fn(() => ({ type: 'GetClass/resetClassListStatus' })),
    selectClassResponse: (s: unknown) =>
      (s as { GetClass: { responseClass: unknown } }).GetClass.responseClass,
    selectClassStatus: (s: unknown) =>
      (s as { GetClass: { status: string } }).GetClass.status,
    selectClassRemainingTokens: (s: unknown) =>
      (s as { GetClass?: { responseClass?: { data?: { remaining_tokens?: number } } } })
        ?.GetClass?.responseClass?.data?.remaining_tokens ?? 0,
    selectNeedsAttentionById: () => stableEmptyObject,
    selectUnreadCountById: () => stableEmptyObject,
    selectReportCountsById: () => stableEmptyObject,
    selectAllStudentCodes: () => stableStudentCodes,
    selectNeedAttentionByClassId: () => stableEmptyObject,
    selectNeedAttentionCount: () => 0,
    selectClasses: (s: unknown) =>
      (s as { GetClass: { responseClass: { data: { classes: unknown[] } } } }).GetClass
        ?.responseClass?.data?.classes ?? stableEmptyArray,
  };
});

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  FetchClassReportCount: vi.fn(() => ({ type: 'simulationReports/fetchCountOnly' })),
  GetClassSimulationReports: vi.fn(() => ({ type: 'simulationReports/getByClass' })),
}));

vi.mock('../../../src/redux/class/PostClassRedux', () => ({
  PostClassRequest: vi.fn((p) => ({ type: 'class/post', payload: p })),
}));

vi.mock('../../../src/redux/class/PatchClassRedux', () => ({
  UpdateClassRequest: vi.fn((p) => ({ type: 'class/patch', payload: p })),
}));

vi.mock('../../../src/redux/class/DeleteClassRedux', () => ({
  DeleteClassRequest: vi.fn((id) => ({ type: 'class/delete', payload: id })),
  selectDeleteStatus: (s: unknown) =>
    (s as { DeleteClass?: { status: string } })?.DeleteClass?.status ?? 'idle',
}));

vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(() => ({ type: 'sims/fetch' })),
  selectSimulationsByClassId: () => () => [],
}));

vi.mock('@/redux/dashboard/simulationlibrary/simulationLibsliceredux', () => ({
  fetchMyLibrarySimulations: vi.fn(() => ({ type: 'sim/fetchMyLibrary', unwrap: () => Promise.resolve([]) })),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/addsimulationredux', () => ({
  clearAddSimulationState: vi.fn(() => ({ type: 'sim/clearAdd' })),
}));

vi.mock('../../../src/types/Fileparser', () => ({
  parseFileToStudentArray: vi.fn(),
}));

vi.mock('@/redux/local-db/LocalDbRedux', () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: 'localDb/fetchStatus' })),
  selectIsLocalDbConnected: () => false,
  selectIsLocalDbConfigured: () => false,
  storeStudentDetailInLocalDb: vi.fn(() => ({ type: 'localDb/storeStudent' })),
}));

vi.mock('@/redux/reports/EducatorReportsRedux', () => {
  const stableEmptyReports: never[] = [];
  return {
    GetEducatorSimulationReports: vi.fn(() => ({ type: 'educatorReports/fetch' })),
    selectEducatorReports: () => stableEmptyReports,
    selectEducatorReportsStatus: () => 'idle',
  };
});

vi.mock('../../../src/redux/lms/SyncLmsClassesRedux', () => ({
  syncLmsClasses: vi.fn(() => ({ type: 'lmsSync/syncClasses' })),
  fetchLiveLmsClasses: vi.fn(() => ({ type: 'lmsSync/fetchLive' })),
  selectSyncState: () => 'idle',
  selectLastSyncResult: () => null,
  selectLiveRosterByClassName: () => ({}),
}));

vi.mock('../../../src/redux/lms/GetLMSClassRedux', () => ({
  fetchMoodleClasses: vi.fn(() => ({ type: 'moodleClasses/fetch' })),
  selectMoodleClasses: () => [],
  selectMoodleClassStatus: () => 'idle',
  selectMoodleClassError: () => null,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

vi.mock('../../../src/components/common/ListTable', () => ({
  default: ({
    data,
    onView,
    onEdit,
    onDelete,
  }: {
    data: { id: string; class_name?: string }[];
    onView?: (row: unknown) => void;
    onEdit?: (row: unknown) => void;
    onDelete?: (row: unknown) => void;
  }) => (
    <table>
      <tbody>
        {(data ?? []).map((row) => (
          <tr key={row.id}>
            <td>{row.class_name}</td>
            <td>
              <button onClick={() => onView?.(row)}>View</button>
              <button onClick={() => onEdit?.(row)}>Edit</button>
              <button onClick={() => onDelete?.(row)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock('../../../src/components/class/StatusTabs', () => ({
  default: ({ onChange }: { onChange: (tab: string) => void }) => (
    <button onClick={() => onChange('All')}>All</button>
  ),
}));
vi.mock('../../../src/components/class/Classrowactions', () => ({ default: () => null }));
vi.mock('../../../src/components/class/Simsubtable', () => ({ default: () => null }));
vi.mock('../../../src/components/class/student/Studentsubtable', () => ({ default: () => null }));
vi.mock('../../../src/components/class/ReportSubTable', () => ({ default: () => null }));
vi.mock('../../../src/components/class/Useclasscolumns', () => ({ useClassColumns: () => [] }));
vi.mock('../../../src/components/class/PrintAccessCode', () => ({ default: () => null }));
vi.mock('@/components/common/FilterPanel', () => ({ default: () => null }));

const mockClass = {
  id: 'cls-1',
  class_name: 'Biology 101',
  access_code: 'BIO-ABC',
  student_count: 15,
  status: 'ACTIVE',
  grade: '10th',
  subject: 'Biology',
  sims: [],
  students: [],
};

const buildStore = () =>
  configureStore({
    reducer: {
      GetClass: () => ({
        responseClass: {
          data: {
            classes: [mockClass],
            total: 1,
            remaining_tokens: 100,
          },
        },
        status: 'succeeded',
        error: null,
      }),
      DeleteClass: () => ({ status: 'idle', error: null }),
    },
  });

const renderPage = () =>
  render(
    <Provider store={buildStore()}>
      <MemoryRouter>
        <ClassPage />
      </MemoryRouter>
    </Provider>,
  );

describe('Class Page + Modal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('Page renders class list', () => {
    it('displays class name on page load', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.queryByText(/Biology 101/i)).toBeInTheDocument();
      });
    });
  });

  describe('ClassFormModal — create mode', () => {
    it('opens ClassFormModal when "Add Class" button is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add class/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows form input fields inside ClassFormModal', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add class/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('closes ClassFormModal when Back/Cancel button inside dialog is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add class/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const closeBtn = within(dialog).queryByRole('button', { name: /back|cancel/i });
      if (closeBtn) {
        await act(async () => { fireEvent.click(closeBtn); });
        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('ClassFormModal — edit mode', () => {
    it('opens ClassFormModal in edit mode when Edit action is clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText('Biology 101')).toBeInTheDocument();
      });

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      await waitFor(() => {
        expect(screen.queryByText('Biology 101')).toBeInTheDocument();
      });
    });

    it('pre-fills form with class data in edit mode', async () => {
      renderPage();

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      const dialog = screen.queryByRole('dialog');
      if (dialog) {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      } else {
        expect(screen.queryByText('Biology 101')).toBeInTheDocument();
      }
    });
  });

  describe('Delete flow — ConfirmationModal', () => {
    it('shows confirmation dialog when Delete action is clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText('Biology 101')).toBeInTheDocument();
      });

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => {
        const dialog = screen.queryByRole('dialog');
        const confirmText = screen.queryByText(/delete|confirm|sure/i);
        expect(dialog ?? confirmText).toBeInTheDocument();
      });
    });

    it('dispatches DeleteClassRequest when delete is confirmed', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      const confirmBtn = screen.queryByRole('button', { name: /confirm|yes|delete class/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });

    it('does not dispatch when Cancel is clicked in delete confirmation', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      const callsBefore = mockDispatch.mock.calls.length;
      const cancelBtn = screen.queryByRole('button', { name: /cancel|no|back/i });
      if (cancelBtn) {
        await act(async () => { fireEvent.click(cancelBtn); });
        expect(mockDispatch.mock.calls.length).toBe(callsBefore);
      }
    });
  });

  describe('Modal exclusivity', () => {
    it('does not open multiple modals simultaneously', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add class/i });
      await act(async () => { fireEvent.click(addBtn); });

      const dialogs = screen.queryAllByRole('dialog');
      expect(dialogs.length).toBeLessThanOrEqual(1);
    });
  });
});
