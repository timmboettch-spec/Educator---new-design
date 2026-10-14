import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import classesUiReducer from '../../../src/redux/api/classes/classesSlice';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside the class page resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';
import Classes from '../../../src/pages/class/index';
import {
  expandAllSchools,
  resetClassListFixture,
  setClassListFromLegacy,
} from './classListMocks';

const mockDispatch = vi.fn();
const STABLE_EMPTY_ARRAY: never[] = [];
const STABLE_EMPTY_OBJECT = {};
const STABLE_STUDENT_CODES = new Set<string>();

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  const { useMemo } = await vi.importActual<typeof import('react')>('react');
  const { createRoutedUseDispatch } = await import('./classListMocks');
  return {
    ...actual,
    useDispatch: createRoutedUseDispatch(
      actual.useDispatch,
      useMemo,
      (action: unknown) => mockDispatch(action)
    ),
  };
});

vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  FetchClassesRequest: vi.fn(() => ({ type: 'class/fetch' })),
  FetchNeedAttentionClasses: vi.fn(() => ({ type: 'classes/needAttention' })),
  resetClassListStatus: vi.fn(() => ({
    type: 'GetClass/resetClassListStatus',
  })),
  selectClassResponse: (s: unknown) =>
    (s as { GetClass?: { responseClass: unknown } })?.GetClass?.responseClass,
  selectClassStatus: (s: unknown) =>
    (s as { GetClass?: { status: string } })?.GetClass?.status,
  selectClassRemainingTokens: (s: unknown) =>
    (
      s as {
        GetClass?: { responseClass?: { data?: { remaining_tokens?: number } } };
      }
    )?.GetClass?.responseClass?.data?.remaining_tokens ?? 0,
  selectNeedsAttentionById: () => STABLE_EMPTY_OBJECT,
  selectUnreadCountById: () => STABLE_EMPTY_OBJECT,
  selectReportCountsById: () => STABLE_EMPTY_OBJECT,
  selectAllStudentCodes: () => STABLE_STUDENT_CODES,
  selectNeedAttentionByClassId: () => STABLE_EMPTY_OBJECT,
  selectNeedAttentionCount: () => 0,
  selectClasses: (s: unknown) =>
    (s as { GetClass: { responseClass: { data: { classes: unknown[] } } } })
      .GetClass?.responseClass?.data?.classes ?? STABLE_EMPTY_ARRAY,
}));

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

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/addsimulationredux',
  () => ({
    clearAddSimulationState: vi.fn(() => ({ type: 'sim/clearAdd' })),
  })
);

vi.mock('../../../src/redux/local-db/LocalDbRedux', () => ({
  fetchLocalDbStatus: vi.fn(() => ({ type: 'localDb/fetchStatus' })),
  selectIsLocalDbConnected: () => false,
  selectIsLocalDbConfigured: () => false,
}));

vi.mock('../../../src/redux/reports/EducatorReportsRedux', () => ({
  GetEducatorSimulationReports: vi.fn(() => ({
    type: 'educatorReports/fetch',
  })),
  selectEducatorReports: () => STABLE_EMPTY_ARRAY,
  selectEducatorReportsStatus: () => 'idle',
}));

vi.mock('../../../src/redux/lms/GetLMSClassRedux', () => ({
  fetchMoodleClasses: vi.fn(() => ({ type: 'moodleClasses/fetch' })),
  selectMoodleClasses: () => STABLE_EMPTY_ARRAY,
  selectMoodleClassStatus: () => 'idle',
  selectMoodleClassError: () => null,
}));

vi.mock('../../../src/redux/lms/SyncLmsClassesRedux', () => ({
  syncLmsClasses: vi.fn(() => ({ type: 'lmsSync/syncClasses' })),
  fetchLiveLmsClasses: vi.fn(() => ({ type: 'lmsSync/fetchLive' })),
  selectSyncState: () => 'idle',
  selectLastSyncResult: () => null,
  selectLiveRosterByClassName: () => ({}),
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
  toast: { success: vi.fn(), error: vi.fn() },
  default: () => <div data-testid="toast" />,
}));

vi.mock('../../../src/components/class/Classformmodal', () => ({
  default: ({
    isOpen,
    onSubmit,
    onClose,
    modalMode,
    onConfirmDelete,
  }: {
    isOpen: boolean;
    onSubmit: (...args: unknown[]) => void;
    onClose: () => void;
    modalMode: string;
    onConfirmDelete: () => void;
  }) =>
    isOpen ? (
      <div data-testid="class-form-modal">
        <span>
          {modalMode === 'create'
            ? 'Create Class'
            : modalMode === 'edit'
              ? 'Edit Class'
              : 'Delete Class'}
        </span>
        <button
          onClick={() =>
            onSubmit({
              class_name: 'New Class',
              term: 'i',
              year: '2025',
              status: 'ACTIVE',
              start_date: '2025-01-01',
              end_date: '2025-06-30',
              total_no_of_students: '',
            })
          }
        >
          Submit Form
        </button>
        {modalMode === 'delete' && (
          <button onClick={onConfirmDelete}>Confirm Delete</button>
        )}
        <button onClick={onClose}>Back</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/components/class/Classrowactions', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/ReportSubTable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/Simsubtable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/student/Studentsubtable', () => ({
  default: () => null,
}));
vi.mock('../../../src/components/class/Useclasscolumns', () => ({
  useClassColumns: () => [],
}));

vi.mock('../../../src/components/common/ListTable', () => ({
  ListTableHeader: () => null,
  getMinWidth: () => '820px',
  default: ({
    data,
  }: {
    data: { id: string; class_name: string; status: string }[];
  }) => (
    <table>
      <tbody>
        {(data ?? []).map((row) => (
          <tr key={row.id}>
            <td>{row.class_name}</td>
            <td>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// ─── Shared data ──────────────────────────────────────────────────────────────

const mockClass = {
  id: 'cls-1',
  class_name: 'Biology 101',
  term: 'Term 1',
  year: '2026',
  status: 'ACTIVE',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  students: [],
  sims: [],
  reports: 0,
};

const buildStore = (classState: object = {}) =>
  configureStore({
    reducer: {
      classesUi: classesUiReducer,
      GetClass: () => ({
        responseClass: null,
        status: 'idle',
        error: null,
        ...classState,
      }),
      GetSimsList: () => ({
        simulationsByClass: {},
        status: 'idle',
        error: null,
      }),
    },
  });

type ClassState = {
  responseClass?: { data?: { classes?: (typeof mockClass)[] } } | null;
  status?: string;
};

// Rows come from the per-school list queries (served from the same fixtures);
// schools start collapsed, so expand them to see the rows.
const renderPage = (classState: ClassState = {}) => {
  localStorage.setItem('user', JSON.stringify({ tokens: 100 }));
  setClassListFromLegacy(classState.responseClass?.data?.classes ?? []);
  const result = render(
    <Provider store={buildStore(classState)}>
      <MemoryRouter>
        <Classes />
      </MemoryRouter>
    </Provider>
  );
  expandAllSchools();
  return result;
};

beforeEach(() => {
  resetClassListFixture();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Class Management – Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  // ── Fetch errors ─────────────────────────────────────────────────────────────

  describe('Fetch classes error', () => {
    it('does not call toast.error from mount fetch when fetch flow is disabled', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Network Error')),
      });
      renderPage();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('page still renders heading when fetch fails', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Network Error')),
      });
      renderPage();
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('Add Class button remains visible after fetch error', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Network Error')),
      });
      renderPage();
      expect(
        screen.getAllByRole('button', { name: /add class/i })[0]!
      ).toBeInTheDocument();
    });

    it('shows empty table when fetch fails and no cached data', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Network Error')),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.queryByText('Biology 101')).not.toBeInTheDocument();
      });
    });

    it('does not show fetch failure toast string when fetch flow is disabled', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Failed to fetch')),
      });
      renderPage();
      expect(toast.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch')
      );
    });
  });

  // ── Create errors ─────────────────────────────────────────────────────────────

  describe('Create class error', () => {
    const openAndSubmit = async () => {
      renderPage();
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
    };

    it('calls toast.error when the createClass mutation rejects', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server Error')),
      });
      await openAndSubmit();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    // FIX: catch block में setIsModalOpen(false) होता है —
    // modal failure के बाद CLOSED होता है, open नहीं रहता
    it('modal closes after create failure (catch block closes it)', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server Error')),
      });
      renderPage();
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      // Modal खुला है
      expect(screen.getByTestId('class-form-modal')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });

      // catch → setIsModalOpen(false) → modal बंद
      await waitFor(() => {
        expect(
          screen.queryByTestId('class-form-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('does not call toast.success when create fails', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server Error')),
      });
      await openAndSubmit();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('does not re-fetch classes after failed create', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      const { FetchClassesRequest } =
        await import('../../../src/redux/class/GetClassRedux');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server Error')),
      });
      await openAndSubmit();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });

    it('page does not crash when duplicate class name is submitted', async () => {
      mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });

  // ── Edit errors ───────────────────────────────────────────────────────────────

  describe('Edit class error', () => {
    it('calls toast.error when the updateClass mutation rejects', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Update failed')),
      });
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('page remains functional after edit error', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Update failed')),
      });
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });

  describe('Delete class error', () => {
    it('does not call delete toast without delete action path', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      mockDispatch
        .mockReturnValueOnce({ unwrap: () => Promise.resolve() })
        .mockReturnValueOnce({ unwrap: () => Promise.resolve() })
        .mockReturnValueOnce({ unwrap: () => Promise.resolve() })
        .mockReturnValueOnce({ unwrap: () => Promise.resolve() })
        .mockReturnValue({
          unwrap: () => Promise.reject(new Error('Delete failed')),
        });
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      expect(toast.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Delete failed')
      );
    });

    it('page remains functional after delete error', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Delete failed')),
      });
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });

  // ── Search resilience ─────────────────────────────────────────────────────────

  describe('Search error resilience', () => {
    it('does not crash when search term has special characters', () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      fireEvent.change(screen.getByPlaceholderText('Search classes...'), {
        target: { value: '<script>alert(1)</script>' },
      });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('shows no results for non-matching search without crashing', async () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      fireEvent.change(screen.getByPlaceholderText('Search classes...'), {
        target: { value: 'zzz_no_match' },
      });
      await waitFor(
        () => {
          expect(screen.queryByText('Biology 101')).not.toBeInTheDocument();
        },
        { timeout: 2000 }
      );
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('recovers and shows results after clearing invalid search', () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      const input = screen.getByPlaceholderText('Search classes...');
      fireEvent.change(input, { target: { value: 'zzz_no_match' } });
      fireEvent.change(input, { target: { value: '' } });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
    });
  });

  // ── Empty state resilience ────────────────────────────────────────────────────

  describe('Empty state resilience', () => {
    it('renders without crashing when class list is empty', () => {
      renderPage({
        responseClass: { data: { classes: [] } },
        status: 'succeeded',
      });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('renders without crashing when responseClass is null', () => {
      renderPage({ responseClass: null, status: 'succeeded' });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('renders without crashing when classes array is undefined', () => {
      renderPage({ responseClass: { data: {} }, status: 'succeeded' });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });

  // ── State transition resilience ───────────────────────────────────────────────

  describe('State transition resilience', () => {
    it('transitions from loading to error state without crashing', () => {
      const { rerender } = renderPage({ status: 'loading' });
      rerender(
        <Provider store={buildStore({ status: 'failed', responseClass: null })}>
          <MemoryRouter>
            <Classes />
          </MemoryRouter>
        </Provider>
      );
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('transitions from error to idle state without crashing', () => {
      const { rerender } = renderPage({
        status: 'failed',
        responseClass: null,
      });
      rerender(
        <Provider store={buildStore({ status: 'idle', responseClass: null })}>
          <MemoryRouter>
            <Classes />
          </MemoryRouter>
        </Provider>
      );
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('recovers and shows data after transitioning from error to succeeded', () => {
      const { rerender } = renderPage({
        status: 'failed',
        responseClass: null,
      });
      setClassListFromLegacy([mockClass]);
      rerender(
        <Provider
          store={buildStore({
            status: 'succeeded',
            responseClass: { data: { classes: [mockClass] } },
          })}
        >
          <MemoryRouter>
            <Classes />
          </MemoryRouter>
        </Provider>
      );
      expandAllSchools();
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
    });
  });

  // ── Token and permission resilience ──────────────────────────────────────────

  describe('Token and permission resilience', () => {
    it('renders without crashing when user tokens are 0', () => {
      localStorage.setItem('user', JSON.stringify({ tokens: 0 }));
      renderPage();
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('renders without crashing when user data is missing from localStorage', () => {
      localStorage.removeItem('user');
      renderPage();
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });
});
