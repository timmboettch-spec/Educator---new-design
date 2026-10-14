import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import classesUiReducer from '../../../src/redux/api/classes/classesSlice';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import ClassPage from '../../../src/pages/class/index';
import {
  expandAllSchools,
  setClassListFromLegacy,
} from '../../unit/class/classListMocks';
import '@testing-library/jest-dom/vitest';
// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside the class page resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';

const mockDispatch = vi.fn();

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  const { useMemo } = await vi.importActual<typeof import('react')>('react');
  const { createRoutedUseDispatch } =
    await import('../../unit/class/classListMocks');
  return {
    ...actual,
    useDispatch: createRoutedUseDispatch(
      actual.useDispatch,
      useMemo,
      (action: unknown) => mockDispatch(action)
    ),
  };
});

vi.mock('../../../src/redux/class/GetClassRedux', () => {
  const stableEmptyObject = {};
  const stableEmptyArray: unknown[] = [];
  const stableStudentCodes = new Set<string>();
  return {
    FetchClassesRequest: vi.fn(() => ({ type: 'class/fetch' })),
    FetchNeedAttentionClasses: vi.fn(() => ({ type: 'classes/needAttention' })),
    resetClassListStatus: vi.fn(() => ({
      type: 'GetClass/resetClassListStatus',
    })),
    selectClassResponse: (s: unknown) =>
      (s as { GetClass: { responseClass: unknown } }).GetClass.responseClass,
    selectClassStatus: (s: unknown) =>
      (s as { GetClass: { status: string } }).GetClass.status,
    selectClassRemainingTokens: (s: unknown) =>
      (
        s as {
          GetClass?: {
            responseClass?: { data?: { remaining_tokens?: number } };
          };
        }
      )?.GetClass?.responseClass?.data?.remaining_tokens ?? 0,
    selectNeedsAttentionById: () => stableEmptyObject,
    selectUnreadCountById: () => stableEmptyObject,
    selectReportCountsById: () => stableEmptyObject,
    selectAllStudentCodes: () => stableStudentCodes,
    selectNeedAttentionByClassId: () => stableEmptyObject,
    selectNeedAttentionCount: () => 0,
    selectClasses: (s: unknown) =>
      (s as { GetClass: { responseClass: { data: { classes: unknown[] } } } })
        .GetClass?.responseClass?.data?.classes ?? stableEmptyArray,
  };
});

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  FetchClassReportCount: vi.fn(() => ({
    type: 'simulationReports/fetchCountOnly',
  })),
  GetClassSimulationReports: vi.fn(() => ({
    type: 'simulationReports/getByClass',
  })),
}));

vi.mock('../../../src/redux/api/classes/classesApi', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/redux/api/classes/classesApi')
    >();
  // Route mutation triggers through mockDispatch so tests control unwrap().
  const { classListHookMocks, classFilterOptionHookMocks } =
    await import('../../unit/class/classListMocks');
  const trigger = (type: string) => (arg: unknown) =>
    mockDispatch({ type, payload: arg });
  return {
    ...actual,
    ...classListHookMocks,
    ...classFilterOptionHookMocks,
    useCreateClassMutation: () => [
      trigger('classesApi/createClass'),
      { isLoading: false },
    ],
    useUpdateClassMutation: () => [
      trigger('classesApi/updateClass'),
      { isLoading: false },
    ],
    useDeleteClassMutation: () => [
      trigger('classesApi/deleteClass'),
      { isLoading: false },
    ],
  };
});

vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(() => ({ type: 'sims/fetch' })),
  selectSimulationsByClassId: () => () => [],
}));

vi.mock('@/redux/dashboard/simulationlibrary/simulationLibsliceredux', () => ({
  fetchMyLibrarySimulations: vi.fn(() => ({
    type: 'sim/fetchMyLibrary',
    unwrap: () => Promise.resolve([]),
  })),
}));

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/addsimulationredux',
  () => ({
    clearAddSimulationState: vi.fn(() => ({ type: 'sim/clearAdd' })),
  })
);

vi.mock('@/redux/local-db/LocalDbRedux', () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: 'localDb/fetchStatus' })),
  selectIsLocalDbConnected: () => false,
  selectIsLocalDbConfigured: () => false,
  storeStudentDetailInLocalDb: vi.fn(() => ({ type: 'localDb/storeStudent' })),
}));

vi.mock('@/redux/reports/EducatorReportsRedux', () => {
  const stableEmptyReports: never[] = [];
  return {
    GetEducatorSimulationReports: vi.fn(() => ({
      type: 'educatorReports/fetch',
    })),
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

vi.mock('../../../src/hooks/useClassesNeedingAttention', () => ({
  useClassesNeedingAttention: () => ({
    status: 'succeeded',
    totalActive: 0,
    needingCount: 0,
    unreadCount: 0,
    noStudentsCount: 0,
    noSimsCount: 0,
  }),
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

vi.mock('../../../src/components/common/ListTable', () => ({
  ListTableHeader: () => null,
  getMinWidth: () => '820px',
  default: ({
    data,
    onView,
    onEdit,
    onDelete,
    renderActions,
  }: {
    data: { id: string; class_name?: string }[];
    onView?: (row: unknown) => void;
    onEdit?: (row: unknown) => void;
    onDelete?: (row: unknown) => void;
    renderActions?: (row: unknown) => React.ReactNode;
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
              {renderActions?.(row)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock('../../../src/components/class/Classrowactions', () => ({
  default: ({
    row,
    onStatusChange,
    onEdit,
    onDelete,
  }: {
    row: unknown;
    onStatusChange: (row: unknown, status: string) => void;
    onEdit: (row: unknown) => void;
    onDelete: (row: unknown) => void;
  }) => (
    <>
      <button onClick={() => onStatusChange(row, 'INACTIVE')}>
        Set status Inactive
      </button>
      <button onClick={() => onEdit(row)}>Edit class</button>
      <button onClick={() => onDelete(row)}>Remove class</button>
    </>
  ),
}));
vi.mock('../../../src/components/class/Simsubtable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/student/Studentsubtable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/ReportSubTable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/Useclasscolumns', () => ({
  useClassColumns: () => [],
}));
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
      classesUi: classesUiReducer,
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
    },
  });

// Rows come from the per-school list queries (served from the same fixture);
// schools start collapsed, so expand them to see the rows.
const renderPage = () => {
  setClassListFromLegacy([mockClass]);
  const result = render(
    <Provider store={buildStore()}>
      <MemoryRouter>
        <ClassPage />
      </MemoryRouter>
    </Provider>
  );
  expandAllSchools();
  return result;
};

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

      const addBtn = (
        await screen.findAllByRole('button', {
          name: /add class/i,
        })
      )[0]!;
      await act(async () => {
        fireEvent.click(addBtn);
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows form input fields inside ClassFormModal', async () => {
      renderPage();

      const addBtn = (
        await screen.findAllByRole('button', {
          name: /add class/i,
        })
      )[0]!;
      await act(async () => {
        fireEvent.click(addBtn);
      });

      await waitFor(() => {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('closes ClassFormModal when Back/Cancel button inside dialog is clicked', async () => {
      renderPage();

      const addBtn = (
        await screen.findAllByRole('button', {
          name: /add class/i,
        })
      )[0]!;
      await act(async () => {
        fireEvent.click(addBtn);
      });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const closeBtn = within(dialog).queryByRole('button', {
        name: /back|cancel/i,
      });
      if (closeBtn) {
        await act(async () => {
          fireEvent.click(closeBtn);
        });
        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      }
    });
  });

  // Edit is opened from ClassRowActions (mocked above), not from ListTable.
  const openEditModal = async () => {
    const editBtn = await screen.findByRole('button', { name: /edit class/i });
    await act(async () => {
      fireEvent.click(editBtn);
    });
    return screen.findByRole('dialog');
  };

  describe('ClassFormModal — edit mode', () => {
    it('opens the edit modal when the Edit action is clicked', async () => {
      renderPage();

      const dialog = await openEditModal();

      expect(
        within(dialog).getByRole('button', { name: /update ?class/i })
      ).toBeInTheDocument();
    });

    it('pre-fills the class name from the selected class', async () => {
      renderPage();

      const dialog = await openEditModal();

      expect(within(dialog).getByTestId('input-class_name')).toHaveValue(
        'Biology 101'
      );
    });
  });

  // Delete is opened from ClassRowActions (mocked above), not from ListTable.
  const openDeleteDialog = async () => {
    const removeBtn = await screen.findByRole('button', {
      name: /remove class/i,
    });
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    return screen.findByRole('dialog');
  };

  const clickInDialog = async (dialog: HTMLElement, name: RegExp) => {
    const button = within(dialog).getByRole('button', { name });
    await act(async () => {
      fireEvent.click(button);
    });
  };

  describe('Delete flow — ConfirmDialog', () => {
    it('shows the confirmation dialog with the class name', async () => {
      renderPage();

      const dialog = await openDeleteDialog();

      expect(within(dialog).getByText('Biology 101')).toBeInTheDocument();
    });

    it('calls the deleteClass mutation when delete is confirmed', async () => {
      renderPage();

      const dialog = await openDeleteDialog();
      await clickInDialog(dialog, /delete/i);

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith({
          type: 'classesApi/deleteClass',
          payload: 'cls-1',
        });
      });
    });

    it('closes without deleting when Back is clicked', async () => {
      renderPage();

      const dialog = await openDeleteDialog();
      await clickInDialog(dialog, /back/i);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'classesApi/deleteClass' })
      );
    });
  });

  describe('Mutation error messages', () => {
    const rejectWith = (error: unknown) =>
      mockDispatch.mockReturnValue({ unwrap: () => Promise.reject(error) });

    const confirmDelete = async () => {
      const dialog = await openDeleteDialog();
      await clickInDialog(dialog, /delete/i);
    };

    it('shows the API message when a status change fails', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage();
      const statusBtn = await screen.findByRole('button', {
        name: /set status inactive/i,
      });
      rejectWith({
        status: 400,
        data: { message: 'Class cannot be deactivated' },
      });
      await act(async () => {
        fireEvent.click(statusBtn);
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Class cannot be deactivated');
      });
    });

    it('falls back to the generic message when a status change fails without one', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage();
      const statusBtn = await screen.findByRole('button', {
        name: /set status inactive/i,
      });
      rejectWith({ status: 500, data: 'Internal Server Error' });
      await act(async () => {
        fireEvent.click(statusBtn);
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update class');
      });
    });

    it('shows the API message when delete fails', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage();
      await screen.findByText('Biology 101');
      rejectWith({
        status: 409,
        data: { message: 'Class has active students' },
      });
      await confirmDelete();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Class has active students');
      });
    });

    it('falls back to the generic message when delete fails without one', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage();
      await screen.findByText('Biology 101');
      rejectWith({ status: 500, data: 'Internal Server Error' });
      await confirmDelete();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to delete class');
      });
    });
  });

  describe('Modal exclusivity', () => {
    it('does not open multiple modals simultaneously', async () => {
      renderPage();

      const addBtn = (
        await screen.findAllByRole('button', {
          name: /add class/i,
        })
      )[0]!;
      await act(async () => {
        fireEvent.click(addBtn);
      });

      const dialogs = screen.queryAllByRole('dialog');
      expect(dialogs.length).toBeLessThanOrEqual(1);
    });
  });
});
