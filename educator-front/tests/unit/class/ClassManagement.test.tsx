import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import classesUiReducer from '../../../src/redux/api/classes/classesSlice';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside the class page resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDispatch = vi.fn();
const STABLE_EMPTY_ARRAY: never[] = [];
const STABLE_EMPTY_OBJECT = {};
const STABLE_STUDENT_CODES = new Set<string>();

/** A filter panel dropdown's trigger, named by its label (the panel must be open). */
const getFilterDropdown = (label: string) =>
  within(screen.getByRole('region', { name: 'Filter Classes' })).getByRole(
    'button',
    { name: label }
  );

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
    (s as { GetClass: { responseClass: unknown } }).GetClass.responseClass,
  selectClassStatus: (s: unknown) =>
    (s as { GetClass: { status: string } }).GetClass.status,
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

vi.mock('../../../src/redux/api/classes/classesApi', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/redux/api/classes/classesApi')
    >();
  // Route mutation triggers through mockDispatch so tests control unwrap().
  const { classListHookMocks, classFilterOptionHookMocks } =
    await import('./classListMocks');
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

vi.mock('../../../src/redux/lms/SyncLmsClassesRedux', () => ({
  syncLmsClasses: vi.fn(() => ({ type: 'lmsSync/syncClasses' })),
  fetchLiveLmsClasses: vi.fn(() => ({ type: 'lmsSync/fetchLive' })),
  selectSyncState: () => 'idle',
  selectLastSyncResult: () => null,
  selectLiveRosterByClassName: () => ({}),
}));

vi.mock('../../../src/redux/lms/GetLMSClassRedux', () => ({
  fetchMoodleClasses: vi.fn(() => ({ type: 'moodleClasses/fetch' })),
  selectMoodleClasses: () => STABLE_EMPTY_ARRAY,
  selectMoodleClassStatus: () => 'idle',
  selectMoodleClassError: () => null,
}));

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  FetchClassReportCount: vi.fn(() => ({
    type: 'simulationReports/fetchCountOnly',
  })),
  GetClassSimulationReports: vi.fn(() => ({
    type: 'simulationReports/getByClass',
  })),
}));

// The attention card is hidden (nothing needs attention) unless a test sets counts.
const NO_ATTENTION = {
  status: 'succeeded',
  totalActive: 0,
  needingCount: 0,
  unreadCount: 0,
  noStudentsCount: 0,
  noSimsCount: 0,
};
const { attentionCounts } = vi.hoisted(() => ({
  attentionCounts: { current: {} as Record<string, unknown> },
}));

vi.mock('../../../src/hooks/useClassesNeedingAttention', () => ({
  useClassesNeedingAttention: () => attentionCounts.current,
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

// Mock ClassFormModal so submit bypasses Yup validation
vi.mock('../../../src/components/class/Classformmodal', () => ({
  default: ({
    isOpen,
    onSubmit,
    onClose,
    modalMode,
  }: {
    isOpen: boolean;
    onSubmit: (...args: unknown[]) => void;
    onClose: () => void;
    modalMode: string;
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
        <Input placeholder="Enter Class name" />
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
        <button onClick={onClose}>Back</button>
        {modalMode === 'delete' && (
          <button onClick={onClose}>Confirm Delete</button>
        )}
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

// ── Store & render helpers ────────────────────────────────────────────────────

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
  responseClass?: {
    data?: {
      classes?: (typeof mockClass & {
        school_id?: string;
        school_name?: string;
      })[];
    };
  } | null;
  status?: string;
};

// Rows now come from the per-school list queries (served from the same
// fixtures); schools start collapsed, so expand them to see the rows.
const renderPage = (
  classState: ClassState = {},
  initialEntries = ['/classes']
) => {
  localStorage.setItem('user', JSON.stringify({ tokens: 100 }));
  setClassListFromLegacy(classState.responseClass?.data?.classes ?? []);
  const result = render(
    <Provider store={buildStore(classState)}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries}>
          <Classes />
        </MemoryRouter>
      </I18nextProvider>
    </Provider>
  );
  expandAllSchools();
  return result;
};

import Classes from '../../../src/pages/class/index';
import Input from '@/components/ui/Input';
import {
  classListFixture,
  expandAllSchools,
  resetClassListFixture,
  setClassListFromLegacy,
} from './classListMocks';

beforeEach(() => {
  resetClassListFixture();
  attentionCounts.current = NO_ATTENTION;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Class Management – Success States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  // ── Page rendering ─────────────────────────────────────────────────────────

  describe('Page rendering', () => {
    it('renders Class Management heading', () => {
      renderPage();
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('renders Add Class buttons above and below the table', () => {
      renderPage();
      expect(
        screen.getAllByRole('button', { name: /add class/i })
      ).toHaveLength(2);
    });

    it('renders search bar', () => {
      renderPage();
      expect(
        screen.getByPlaceholderText('Search classes...')
      ).toBeInTheDocument();
    });

    it('renders class row when data is available', () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
    });

    it('renders multiple class rows', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
            ],
          },
        },
        status: 'succeeded',
      });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
      expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
    });
  });

  // ── Create class success ───────────────────────────────────────────────────

  describe('Create class success', () => {
    const openCreateModal = async () => {
      renderPage();
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: /add class/i })[0]!
        );
      });
    };

    it('opens Create Class modal on Add Class click', async () => {
      await openCreateModal();
      expect(screen.getByTestId('class-form-modal')).toBeInTheDocument();
    });

    it('renders class name input in create modal', async () => {
      await openCreateModal();
      expect(
        screen.getByPlaceholderText(/enter class name/i)
      ).toBeInTheDocument();
    });

    it('calls the createClass mutation on valid form submit', async () => {
      await openCreateModal();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'classesApi/createClass' })
        );
      });
    });

    it('does not re-fetch classes after successful creation', async () => {
      const { FetchClassesRequest } =
        await import('../../../src/redux/class/GetClassRedux');
      await openCreateModal();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });

    it('closes modal when Back button is clicked', async () => {
      await openCreateModal();
      fireEvent.click(screen.getByRole('button', { name: /back/i }));
      await waitFor(() => {
        expect(
          screen.queryByTestId('class-form-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('does not call the createClass mutation when Back is clicked', async () => {
      await openCreateModal();
      fireEvent.click(screen.getByRole('button', { name: /back/i }));
      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'classesApi/createClass' })
      );
    });
  });

  // ── Edit class success ─────────────────────────────────────────────────────

  describe('Edit class success', () => {
    it('does not re-fetch classes after successful edit submit', async () => {
      const { FetchClassesRequest } =
        await import('../../../src/redux/class/GetClassRedux');
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
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });
  });

  // ── Delete class success ───────────────────────────────────────────────────

  describe('Delete class success', () => {
    it('does not re-fetch classes on mount', async () => {
      const { FetchClassesRequest } =
        await import('../../../src/redux/class/GetClassRedux');
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      expect(FetchClassesRequest).not.toHaveBeenCalled();
    });

    it('deleteClass mutation is not called without user action', async () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'classesApi/deleteClass' })
      );
    });
  });

  // ── Search success state ───────────────────────────────────────────────────

  describe('Search success state', () => {
    it('filters classes by search term', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
            ],
          },
        },
        status: 'succeeded',
      });
      fireEvent.change(screen.getByPlaceholderText('Search classes...'), {
        target: { value: 'Biology' },
      });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
    });

    it('shows all classes when search is cleared', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
            ],
          },
        },
        status: 'succeeded',
      });
      const input = screen.getByPlaceholderText('Search classes...');
      fireEvent.change(input, { target: { value: 'Biology' } });
      fireEvent.change(input, { target: { value: '' } });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
      expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
    });
  });

  // ── Status tab success state ───────────────────────────────────────────────

  describe('Status tab filtering', () => {
    it('shows all classes by default', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              {
                ...mockClass,
                id: 'cls-2',
                class_name: 'Chemistry 202',
                status: 'INACTIVE',
              },
            ],
          },
        },
        status: 'succeeded',
      });
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
      expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
    });

    it('filters to the picked class via the Class Name filter', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
            ],
          },
        },
        status: 'succeeded',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
      fireEvent.click(getFilterDropdown('Class Name'));
      fireEvent.click(screen.getByRole('option', { name: 'Chemistry 202' }));
      fireEvent.click(screen.getByText('Apply Filter'));
      expandAllSchools();

      expect(classListFixture.classArgs.at(-1)).toMatchObject({
        classId: ['cls-2'],
      });
      expect(screen.getAllByText('Chemistry 202').length).toBeGreaterThan(0);
      expect(screen.queryByText('Biology 101')).not.toBeInTheDocument();
    });

    it('hides schools without the picked class when the Class Name filter is applied', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              {
                ...mockClass,
                id: 'cls-2',
                class_name: 'Chemistry 202',
                school_id: 'sch-2',
                school_name: 'Riverside',
              },
            ],
          },
        },
        status: 'succeeded',
      });
      expect(
        screen.getByRole('button', { name: /^School: Test School/ })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
      fireEvent.click(getFilterDropdown('Class Name'));
      fireEvent.click(screen.getByRole('option', { name: 'Chemistry 202' }));
      fireEvent.click(screen.getByText('Apply Filter'));

      expect(classListFixture.schoolArgs.at(-1)).toMatchObject({
        classId: ['cls-2'],
      });
      expect(
        screen.getByRole('button', { name: /^School: Riverside/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^School: Test School/ })
      ).not.toBeInTheDocument();
    });

    it('filters to active classes via the Status filter', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              {
                ...mockClass,
                id: 'cls-2',
                class_name: 'Chemistry 202',
                status: 'INACTIVE',
                start_date: '2024-01-01',
                end_date: '2024-06-30',
              },
            ],
          },
        },
        status: 'succeeded',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
      fireEvent.click(getFilterDropdown('Class Status'));
      fireEvent.click(screen.getByRole('option', { name: 'Active' }));
      fireEvent.click(screen.getByText('Apply Filter'));

      expect(screen.getByText('Biology 101')).toBeInTheDocument();
      expect(screen.queryByText('Chemistry 202')).not.toBeInTheDocument();
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders page without crashing in loading state', () => {
      renderPage({ status: 'loading' });
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('Add Class button is visible during loading', () => {
      renderPage({ status: 'loading' });
      expect(
        screen.getAllByRole('button', { name: /add class/i })[0]!
      ).toBeInTheDocument();
    });
  });

  // ── Filter panel success state ─────────────────────────────────────────────

  describe('Filter panel', () => {
    it('opens filter panel on filter button click', () => {
      renderPage();
      const filterBtn = screen.getByRole('button', { name: 'Filter classes' });
      fireEvent.click(filterBtn);
      expect(screen.getByText('Apply Filter')).toBeInTheDocument();
    });

    it('closes filter panel after Apply Filter click', () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      const filterBtn = screen.getByRole('button', { name: 'Filter classes' });
      fireEvent.click(filterBtn);

      // Open the Status dropdown and select a value so the filter guard is satisfied
      fireEvent.click(getFilterDropdown('Class Status'));
      fireEvent.click(screen.getByRole('option', { name: 'Active' }));

      fireEvent.click(screen.getByText('Apply Filter'));
      expect(screen.queryByText('Apply Filter')).not.toBeInTheDocument();
    });

    describe('focus return', () => {
      const openPanel = () => {
        renderPage({
          responseClass: { data: { classes: [mockClass] } },
          status: 'succeeded',
        });
        fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
      };

      it('returns focus to the filter button when the panel is closed', () => {
        openPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));

        expect(screen.queryByText('Apply Filter')).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Filter classes' })
        ).toHaveFocus();
      });

      it('returns focus to the filter button when Escape dismisses the panel', () => {
        openPanel();
        fireEvent.keyDown(
          screen.getByRole('region', { name: 'Filter Classes' }),
          { key: 'Escape' }
        );

        expect(
          screen.getByRole('button', { name: 'Filter classes' })
        ).toHaveFocus();
      });

      it('returns focus to the filter button after Apply', () => {
        openPanel();
        fireEvent.click(getFilterDropdown('Class Status'));
        fireEvent.click(screen.getByRole('option', { name: 'Active' }));
        fireEvent.click(screen.getByText('Apply Filter'));

        expect(
          screen.getByRole('button', { name: 'Filters applied (1)' })
        ).toHaveFocus();
      });
    });

    it('announces how many classes match the list to screen readers', () => {
      renderPage({
        responseClass: {
          data: {
            classes: [
              mockClass,
              { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
            ],
          },
        },
        status: 'succeeded',
      });

      expect(
        screen
          .getAllByRole('status')
          .some((region) => region.textContent === '2 classes found')
      ).toBe(true);
    });

    describe('date filters', () => {
      const openPanel = () => {
        renderPage({
          responseClass: { data: { classes: [mockClass] } },
          status: 'succeeded',
        });
        fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
      };
      // Args are recorded on every render, so check none ever carried a date.
      const sentDateFilter = () =>
        classListFixture.classArgs.some(
          (arg) => arg.startDateFrom || arg.endDateTo
        );
      const setDate = (label: RegExp, value: string) =>
        fireEvent.change(screen.getByLabelText(label), {
          target: { value },
        });

      it('sends the picked dates as ISO and shows them as MM-DD-YYYY', () => {
        openPanel();

        setDate(/Class Start Date/, '2024-02-01');
        setDate(/Class End Date/, '2024-02-29');
        fireEvent.click(screen.getByText('Apply Filter'));
        expandAllSchools();

        expect(screen.queryByText('Apply Filter')).not.toBeInTheDocument();
        expect(classListFixture.classArgs.at(-1)).toMatchObject({
          startDateFrom: '2024-02-01',
          endDateTo: '2024-02-29',
        });
        expect(screen.getByText(/02-01-2024/)).toBeInTheDocument();
        expect(screen.getByText(/02-29-2024/)).toBeInTheDocument();
      });

      it('reports an end date before the start date inline and sends nothing', () => {
        openPanel();

        setDate(/Class Start Date/, '2024-03-10');
        setDate(/Class End Date/, '2024-03-09');
        fireEvent.click(screen.getByText('Apply Filter'));

        expect(screen.getByRole('alert')).toHaveTextContent(
          "End date can't be before the start date."
        );
        expect(screen.getByText('Apply Filter')).toBeInTheDocument();
        expect(sentDateFilter()).toBe(false);

        // Changing a date clears the message.
        setDate(/Class End Date/, '2024-03-11');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });

      it('drops the error and the invalid dates when the filter button closes the panel', () => {
        openPanel();
        setDate(/Class Start Date/, '2024-03-10');
        setDate(/Class End Date/, '2024-03-09');
        fireEvent.click(screen.getByText('Apply Filter'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        const filterBtn = screen.getByRole('button', {
          name: 'Filter classes',
        });
        fireEvent.click(filterBtn);
        expect(screen.queryByText('Apply Filter')).not.toBeInTheDocument();
        expect(filterBtn).toHaveFocus();

        fireEvent.click(filterBtn);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Class Start Date/)).toHaveValue('');
        expect(screen.getByLabelText(/Class End Date/)).toHaveValue('');
      });

      it('accepts the same day as start and end', () => {
        openPanel();

        setDate(/Class Start Date/, '2024-03-10');
        setDate(/Class End Date/, '2024-03-10');
        fireEvent.click(screen.getByText('Apply Filter'));

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByText('Apply Filter')).not.toBeInTheDocument();
      });
    });

    it('announces the filter button as expanded while the panel is open, whatever is applied', () => {
      renderPage({
        responseClass: { data: { classes: [mockClass] } },
        status: 'succeeded',
      });
      const filterBtn = screen.getByRole('button', { name: 'Filter classes' });
      expect(filterBtn).toHaveAttribute('aria-expanded', 'false');
      expect(filterBtn).not.toHaveAttribute('aria-pressed');

      fireEvent.click(filterBtn);
      expect(filterBtn).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(getFilterDropdown('Class Status'));
      fireEvent.click(screen.getByRole('option', { name: 'Active' }));
      fireEvent.click(screen.getByText('Apply Filter'));

      // Filters applied, panel closed: collapsed, with the count in its name.
      expect(
        screen.getByRole('button', { name: 'Filters applied (1)' })
      ).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

// ── Navigation expansion tests ─────────────────────────────────────────────

describe('Report expansion on navigation from Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve({ data: { classes: [mockClass] } }),
    });
  });

  it('FetchClassReportCount is not dispatched on mount', async () => {
    const { FetchClassReportCount } =
      await import('../../../src/redux/class/SimsCompletedreportsRedux');
    renderPage({
      responseClass: { data: { classes: [mockClass] } },
      status: 'succeeded',
    });
    expect(FetchClassReportCount).not.toHaveBeenCalled();
  });

  it('GetClassSimulationReports is NOT called during eager count fetch', async () => {
    const { GetClassSimulationReports } =
      await import('../../../src/redux/class/SimsCompletedreportsRedux');
    renderPage({
      responseClass: { data: { classes: [mockClass] } },
      status: 'succeeded',
    });
    // Give effects time to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(GetClassSimulationReports).not.toHaveBeenCalled();
  });
});

// ── Attention filter from ?measure= (e.g. dashboard "View Classes with …") ──

describe('Attention filter from the measure URL param', () => {
  const twoClasses = {
    responseClass: {
      data: {
        classes: [
          mockClass,
          { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
        ],
      },
    },
    status: 'succeeded',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  it('filters the school and class lists by the measure and shows a chip', async () => {
    classListFixture.measureClassIds.unreadReports = ['cls-2'];
    renderPage(twoClasses, ['/classes?measure=unreadReports']);

    expect(
      await screen.findByText('Classes with unread reports (1)')
    ).toBeInTheDocument();
    expandAllSchools();
    expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
    expect(screen.queryByText('Biology 101')).not.toBeInTheDocument();
    expect(classListFixture.schoolArgs.at(-1)).toMatchObject({
      measure: 'unreadReports',
    });
    // The BE applies the measure instead of the base filters.
    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      measure: 'unreadReports',
    });
    expect(classListFixture.classArgs.at(-1)).not.toHaveProperty('status');
  });

  it('clearing the chip shows every class again', async () => {
    classListFixture.measureClassIds.noStudents = ['cls-2'];
    renderPage(twoClasses, ['/classes?measure=noStudents']);

    await screen.findByText('Classes with no students (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));

    await waitFor(() =>
      expect(
        screen.queryByText('Classes with no students (1)')
      ).not.toBeInTheDocument()
    );
    expandAllSchools();
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
    expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
  });

  it('filters to a dashboard activity measure such as closingSoon', async () => {
    classListFixture.measureClassIds.closingSoon = ['cls-1'];
    renderPage(twoClasses, ['/classes?measure=closingSoon']);

    expect(
      await screen.findByText('Classes closing within 14 days (1)')
    ).toBeInTheDocument();
    expandAllSchools();
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
    expect(screen.queryByText('Chemistry 202')).not.toBeInTheDocument();
  });

  it('drops the measure filter when ?measure= is removed from the URL', async () => {
    classListFixture.measureClassIds.unreadReports = ['cls-2'];
    const Unfilter = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/classes')}>
          test-unfilter
        </button>
      );
    };
    localStorage.setItem('user', JSON.stringify({ tokens: 100 }));
    setClassListFromLegacy(twoClasses.responseClass.data.classes);
    render(
      <Provider store={buildStore(twoClasses)}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/classes?measure=unreadReports']}>
            <Unfilter />
            <Classes />
          </MemoryRouter>
        </I18nextProvider>
      </Provider>
    );
    await screen.findByText('Classes with unread reports (1)');

    fireEvent.click(screen.getByRole('button', { name: 'test-unfilter' }));
    expandAllSchools();

    expect(screen.queryByText(/Classes with unread reports/)).toBeNull();
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
    expect(screen.getByText('Chemistry 202')).toBeInTheDocument();
  });

  it('rejects inherited object keys such as toString as a measure', async () => {
    renderPage(twoClasses, ['/classes?measure=toString']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(classListFixture.schoolArgs.some((arg) => 'measure' in arg)).toBe(
      false
    );
    expect(screen.queryByText(/Showing:/)).not.toBeInTheDocument();
  });

  it('ignores an unknown measure without sending it to the BE', async () => {
    renderPage(twoClasses, ['/classes?measure=foo']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(classListFixture.classArgs.some((arg) => 'measure' in arg)).toBe(
      false
    );
    expect(screen.queryByText(/Showing:/)).not.toBeInTheDocument();
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
  });

  it('shows a generic toast when the measure count request fails', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    classListFixture.attentionCountError = true;
    renderPage(twoClasses, ['/classes?measure=noAssignedSims']);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't load those classes. Please try again."
      )
    );
  });
});

// ── Quick filter + panel filters + search, combined ─────────────────────────

describe('Combined filtering', () => {
  const classes = {
    responseClass: {
      data: {
        classes: [
          mockClass,
          { ...mockClass, id: 'cls-2', class_name: 'Chemistry 202' },
          {
            ...mockClass,
            id: 'cls-3',
            class_name: 'Biology 303',
            status: 'INACTIVE',
          },
        ],
      },
    },
    status: 'succeeded',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    classListFixture.measureClassIds.noStudents = ['cls-1', 'cls-2', 'cls-3'];
    classListFixture.measureClassIds.unreadReports = ['cls-2'];
    attentionCounts.current = {
      ...NO_ATTENTION,
      totalActive: 3,
      needingCount: 3,
      unreadCount: 1,
      noStudentsCount: 3,
    };
  });

  const noStudentsButton = () =>
    screen.getByRole('button', { name: 'View Classes with No Students (3)' });
  const unreadButton = () =>
    screen.getByRole('button', {
      name: 'View Classes with Unread Reports (1)',
    });
  const search = async (term: string) => {
    fireEvent.change(screen.getByPlaceholderText('Search classes...'), {
      target: { value: term },
    });
    // The search box debounces before updating the list query.
    await waitFor(() =>
      expect(classListFixture.schoolArgs.at(-1)?.className).toBe(term)
    );
  };

  const applyActiveStatusFilter = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Filter classes' }));
    fireEvent.click(getFilterDropdown('Class Status'));
    fireEvent.click(screen.getByRole('option', { name: 'Active' }));
    fireEvent.click(screen.getByText('Apply Filter'));
  };

  const showingChip = () =>
    screen
      .queryAllByRole('status')
      .find((el) => el.textContent?.includes('Showing:'));

  it('keeps search and panel filters when a quick filter is clicked, and sends all three together', async () => {
    renderPage(classes);
    await search('Bio');
    applyActiveStatusFilter();

    const argsBefore = classListFixture.schoolArgs.length;
    fireEvent.click(noStudentsButton());
    expandAllSchools();

    expect(screen.getByPlaceholderText('Search classes...')).toHaveValue('Bio');
    expect(
      screen.getByRole('button', {
        name: 'Remove Status filter: Active',
      })
    ).toBeInTheDocument();
    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      search: 'Bio',
      status: ['ACTIVE'],
      measure: 'noStudents',
    });
    // One step: no request with the other filters cleared in between.
    classListFixture.schoolArgs
      .slice(argsBefore)
      .forEach((arg) =>
        expect(arg).toMatchObject({ className: 'Bio', measure: 'noStudents' })
      );
    expect(screen.getByText('Biology 101')).toBeInTheDocument();
    expect(screen.queryByText('Biology 303')).not.toBeInTheDocument();
    expect(screen.queryByText('Chemistry 202')).not.toBeInTheDocument();
  });

  it('keeps the quick filter and search when panel filters are applied', async () => {
    renderPage(classes, ['/classes?measure=noStudents']);
    await search('Bio');
    applyActiveStatusFilter();

    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      search: 'Bio',
      status: ['ACTIVE'],
      measure: 'noStudents',
    });
    expect(showingChip()).toHaveTextContent('Classes with no students');
  });

  it('keeps the quick filter and panel filters when search changes', async () => {
    renderPage(classes, ['/classes?measure=noStudents']);
    applyActiveStatusFilter();
    await search('Chem');

    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      search: 'Chem',
      status: ['ACTIVE'],
      measure: 'noStudents',
    });
    expect(showingChip()).toHaveTextContent('Classes with no students');
  });

  it('replaces the quick filter with another, and turns it off when clicked again', () => {
    renderPage(classes);

    fireEvent.click(noStudentsButton());
    expect(noStudentsButton()).toHaveAttribute('aria-pressed', 'true');
    expect(showingChip()).toHaveTextContent('Classes with no students');

    fireEvent.click(unreadButton());
    expect(unreadButton()).toHaveAttribute('aria-pressed', 'true');
    expect(noStudentsButton()).toHaveAttribute('aria-pressed', 'false');
    expect(showingChip()).toHaveTextContent('Classes with unread reports');

    fireEvent.click(unreadButton());
    expect(unreadButton()).toHaveAttribute('aria-pressed', 'false');
    expect(showingChip()).toBeUndefined();
  });

  it('Reset Filter clears the panel filters only, keeping the quick filter and search', async () => {
    renderPage(classes, ['/classes?measure=noStudents']);
    await search('Bio');
    applyActiveStatusFilter();

    fireEvent.click(screen.getByRole('button', { name: /Filters applied/ }));
    fireEvent.click(screen.getByText('Reset Filter'));

    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      search: 'Bio',
      measure: 'noStudents',
    });
    expect(classListFixture.classArgs.at(-1)).not.toHaveProperty('status');
    expect(showingChip()).toHaveTextContent('Classes with no students');
    expect(screen.getByPlaceholderText('Search classes...')).toHaveValue('Bio');
  });

  it('the chip × removes only the quick filter', async () => {
    renderPage(classes, ['/classes?measure=noStudents']);
    await search('Bio');
    applyActiveStatusFilter();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(showingChip()).toBeUndefined();
    expect(classListFixture.classArgs.at(-1)).toMatchObject({
      search: 'Bio',
      status: ['ACTIVE'],
    });
    expect(classListFixture.classArgs.at(-1)).not.toHaveProperty('measure');
  });

  it('the chip counts the filtered results, while the card counts stay global', async () => {
    renderPage(classes, ['/classes?measure=noStudents']);
    expect(showingChip()).toHaveTextContent('Classes with no students (3)');

    await search('Bio');
    await waitFor(() =>
      expect(showingChip()).toHaveTextContent('Classes with no students (2)')
    );
    applyActiveStatusFilter();
    expect(showingChip()).toHaveTextContent('Classes with no students (1)');
    expect(classListFixture.countArgs.at(-1)).toMatchObject({
      pageSize: 1,
      search: 'Bio',
      status: ['ACTIVE'],
      measure: 'noStudents',
    });
    expect(noStudentsButton()).toBeInTheDocument();
  });

  it('does not request the lists without the measure when opened from a ?measure= link', () => {
    renderPage(classes, ['/classes?measure=unreadReports']);
    expect(classListFixture.schoolArgs.length).toBeGreaterThan(0);
    classListFixture.schoolArgs.forEach((arg) =>
      expect(arg).toMatchObject({ measure: 'unreadReports' })
    );
  });
});
