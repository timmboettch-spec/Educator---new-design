import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import '../../../src/i18n';

vi.mock('../../../src/redux/config.tsx', () => ({
  default: {
    GetSimulationApi: 'http://mock/sims',
    DeleteclassSimsApi: 'http://mock/sims',
    AssignSimulationApi: 'http://mock/sims/assign',
  },
  setServerConfig: () => ({}),
}));

vi.mock('../../../src/redux/axiosInstance', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../ClassSimulation', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="create-sim-modal">
      <button onClick={onClose}>Close Create</button>
    </div>
  ),
}));

vi.mock(
  '../../../src/components/class/simulation/DeleteSimulationModal',
  () => ({
    default: ({
      onClose,
      onDeleted,
    }: {
      onClose: () => void;
      onDeleted: () => void;
    }) => (
      <div data-testid="delete-sim-modal">
        <button onClick={onClose}>Cancel Delete</button>
        <button onClick={onDeleted}>Confirm Delete</button>
      </div>
    ),
  })
);

vi.mock('../../../src/components/class/simulation/ExportGradeModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-grade-modal">
      <button onClick={onClose}>Close Export Grade</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/simulation/ExportReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-report-modal">
      <button onClick={onClose}>Close Export Report</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/BulkEmailReportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="email-report-modal">
      <button onClick={onClose}>Close Email</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/simulation/AIInsightsModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="ai-insights-modal">
      <button onClick={onClose}>Close AI</button>
    </div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockDispatch = vi.fn(() => Promise.resolve());

let mockStoreState: {
  GetSimsList: {
    simulationsByClass: Record<string, unknown[]>;
    status: string;
    error: null;
  };
} = {
  GetSimsList: {
    simulationsByClass: {},
    status: 'idle',
    error: null,
  },
};

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector(mockStoreState),
}));
vi.mock('../../../src/hooks/useMarkAllSimReports', () => ({
  useMarkAllSimReports: () => ({
    markAll: vi.fn().mockResolvedValue(true),
    isMarking: false,
  }),
}));

vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(() => ({
    type: 'simulations/getByClass',
  })),

  selectSimulationsByClassId:
    (classId: string) =>
    (state: {
      GetSimsList: {
        simulationsByClass: Record<string, unknown[]>;
      };
    }) =>
      state.GetSimsList.simulationsByClass[classId] ?? [],
}));

vi.mock(
  '../../../../redux/dashboard/simulationlibrary/addsimulationredux',
  () => ({
    clearAddSimulationState: vi.fn(() => ({
      type: 'sim/clearAdd',
    })),
  })
);

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  GetClassSimulationReports: vi.fn(() => ({ type: 'simsCompleted/getClass' })),
  selectClassReports: () => [],
  selectClassReportsStatus: () => 'idle',
}));

vi.mock(
  '../../../src/components/class/simulation/SimulationReportsModal',
  () => ({
    // The modal loads its own reports; the row passes which class and simulation.
    default: ({
      simName,
      classId,
      simulationId,
    }: {
      simName: string;
      classId: string;
      simulationId: string;
    }) => (
      <div data-testid="sim-reports-modal">
        <span>{simName}</span>
        <span>
          ids: {classId}/{simulationId}
        </span>
      </div>
    ),
  })
);

const useGetClassSimulationsInfiniteQuery = vi.fn();
const updateClassSimulation = vi.fn();
vi.mock('../../../src/redux/api/classSimulations/classSimulationsApi', () => ({
  useGetClassSimulationsInfiniteQuery: (...args: unknown[]) =>
    useGetClassSimulationsInfiniteQuery(...args),
  useUpdateClassSimulationMutation: () => [
    updateClassSimulation,
    { isLoading: false },
  ],
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

import SimsExpandedRow from '../../../src/components/class/Simsubtable';
import { FetchSimulationsByClass } from '../../../src/redux/class/GetSimsRedux';
import type { ClassSimulationListItemResDto } from '../../../src/redux/api/classSimulations/classSimulations.types';

const refetch = vi.fn();
const fetchNextPage = vi.fn();

/** Mocks the listing query with the given pages of assignments. */
function mockAssignments(
  pages: ClassSimulationListItemResDto[][],
  overrides: Record<string, unknown> = {}
) {
  useGetClassSimulationsInfiniteQuery.mockReturnValue({
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

const lastQueryArg = () =>
  useGetClassSimulationsInfiniteQuery.mock.lastCall?.[0];

const assignment = (
  overrides: Partial<ClassSimulationListItemResDto> = {}
): ClassSimulationListItemResDto => ({
  classSimulationId: 'assign-past',
  simId: 'sim-past',
  simName: 'Past Sim',
  isArchived: false,
  startDate: '2020-01-01',
  dueDate: '2020-01-15',
  closeDate: '2020-01-20',
  startedCount: 0,
  completedCount: 0,
  averageScore: null,
  avatarEnabled: false,
  unitId: null,
  unitName: null,
  ...overrides,
});

const ASSIGN_CONTEXT = {
  id: 'class-1',
  name: 'Math 101',
  startDate: '2020-01-01',
  endDate: '2020-12-31',
  studentsCount: 0,
  schoolId: 'school-1',
  schoolName: 'North High',
};

const renderRow = (
  props: Partial<React.ComponentProps<typeof SimsExpandedRow>> = {}
) => {
  mockStoreState = {
    GetSimsList: { simulationsByClass: {}, status: 'idle', error: null },
  };
  const store = configureStore({
    reducer: { GetSimsList: () => mockStoreState.GetSimsList },
  });
  return render(
    <Provider store={store}>
      <SimsExpandedRow
        classId="class-1"
        className="Math 101"
        assignContext={ASSIGN_CONTEXT}
        students={[]}
        {...props}
      />
    </Provider>
  );
};

const rowOf = (title: string) =>
  screen.getByText(title).closest('tr') as HTMLTableRowElement;

beforeEach(() => {
  vi.clearAllMocks();
  mockAssignments([[]]);
});

describe('SimsExpandedRow – list states', () => {
  it('shows loading placeholders before the first page arrives', () => {
    useGetClassSimulationsInfiniteQuery.mockReturnValue({
      currentData: undefined,
      isFetching: true,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch,
    });
    renderRow();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading simulations…'
    );
  });

  it('shows the empty message when the class has no assignments', () => {
    renderRow();
    expect(
      screen.getByText('No simulations assigned to this class yet.')
    ).toBeInTheDocument();
  });

  it('shows an error with Retry when the list fails to load', () => {
    useGetClassSimulationsInfiniteQuery.mockReturnValue({
      currentData: undefined,
      isFetching: false,
      isError: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch,
    });
    renderRow();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load simulations."
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('asks for the class with no sort by default', () => {
    renderRow();
    expect(lastQueryArg()).toEqual({ classId: 'class-1', pageSize: 10 });
  });

  it('sends the chosen sort to the API and cycles asc → desc → none', () => {
    mockAssignments([[assignment()]]);
    renderRow();
    const sortStarted = () =>
      fireEvent.click(screen.getByRole('button', { name: /^Started/ }));

    sortStarted();
    expect(lastQueryArg()).toMatchObject({
      sortBy: 'startedCount',
      sortDir: 'asc',
    });
    sortStarted();
    expect(lastQueryArg()).toMatchObject({
      sortBy: 'startedCount',
      sortDir: 'desc',
    });
    sortStarted();
    expect(lastQueryArg()).toEqual({ classId: 'class-1', pageSize: 10 });
  });
});

describe('SimsExpandedRow – rows', () => {
  it('renders the API dates in MM-DD-YYYY, coloured by the assignment window', () => {
    mockAssignments([[assignment()]]);
    renderRow();
    expect(screen.getByText('01-15-2020').closest('td')).toHaveClass(
      'text-red-500'
    );
    expect(screen.getByText('01-20-2020').closest('td')).toHaveClass(
      'text-red-500'
    );
    expect(within(rowOf('Past Sim')).getByText('Past')).toBeInTheDocument();
  });

  it('shows the started / completed / average counts from the API', () => {
    mockAssignments([
      [assignment({ startedCount: 3, completedCount: 2, averageScore: 78 })],
    ]);
    renderRow();
    const cells = rowOf('Past Sim').querySelectorAll('td');
    expect(cells[5]).toHaveTextContent('3');
    expect(cells[6]).toHaveTextContent('2');
    expect(cells[7]).toHaveTextContent('78%');
  });

  it("opens Reports for that assignment's catalog simulation in this class", () => {
    mockAssignments([[assignment()]]);
    renderRow();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reports / Transcripts' })
    );
    const modal = screen.getByTestId('sim-reports-modal');
    expect(modal).toHaveTextContent('Past Sim');
    // The catalog simulation id, not the assignment id.
    expect(modal).toHaveTextContent('ids: class-1/sim-past');
  });
});

describe('SimsExpandedRow – Reports / Transcripts button', () => {
  it('stays gray even while an assignment report is unread', () => {
    mockAssignments([
      [
        assignment({
          startDate: '2026-01-01',
          dueDate: '2026-01-20',
          closeDate: '2026-01-31',
        }),
      ],
    ]);
    renderRow({
      reports: [
        { id: 'r1', scenarioId: 'sim-past', completed_at: '2026-01-10' },
      ] as never,
    });
    const button = screen.getByRole('button', {
      name: 'Reports / Transcripts',
    });
    expect(button).toHaveClass('bg-gray-50');
    expect(button).not.toHaveClass('bg-primary-500');
  });
});

describe('SimsExpandedRow – deep links', () => {
  it('loads the next page while the linked assignment is not loaded yet', () => {
    mockAssignments([[assignment()]], { hasNextPage: true });
    renderRow({ targetSimulationId: 'sim-later' });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('waits while a page is already loading', () => {
    mockAssignments([[assignment()]], {
      hasNextPage: true,
      isFetchingNextPage: true,
    });
    renderRow({ targetSimulationId: 'sim-later' });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('highlights the assignment and opens its reports once a later page brings it in', () => {
    const later = assignment({
      classSimulationId: 'assign-later',
      simId: 'sim-later',
      simName: 'Later Sim',
    });
    mockAssignments([[assignment()]], { hasNextPage: true });
    const { rerender } = renderRow({
      targetSimulationId: 'sim-later',
      defaultSimReportsId: 'sim-later',
    });

    mockAssignments([[assignment()], [later]]);
    const store = configureStore({
      reducer: { GetSimsList: () => mockStoreState.GetSimsList },
    });
    rerender(
      <Provider store={store}>
        <SimsExpandedRow
          classId="class-1"
          className="Math 101"
          assignContext={ASSIGN_CONTEXT}
          students={[]}
          targetSimulationId="sim-later"
          defaultSimReportsId="sim-later"
        />
      </Provider>
    );

    expect(
      within(screen.getByTestId('sim-reports-modal')).getByText('Later Sim')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Later Sim')[0]?.closest('tr')).toHaveClass(
      'bg-[#e9e9e9]'
    );
  });

  it('does not re-request a failed page on its own', () => {
    mockAssignments([[assignment()]], {
      hasNextPage: true,
      isError: true,
      direction: 'forward',
    });
    renderRow({ targetSimulationId: 'sim-later' });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('still applies the link when Retry brings the assignment in after a failed page', () => {
    const later = assignment({
      classSimulationId: 'assign-later',
      simId: 'sim-later',
      simName: 'Later Sim',
    });
    const props = {
      classId: 'class-1',
      className: 'Math 101',
      assignContext: ASSIGN_CONTEXT,
      students: [],
      targetSimulationId: 'sim-later',
      defaultSimReportsId: 'sim-later',
    };
    mockAssignments([[assignment()]], {
      hasNextPage: true,
      isError: true,
      direction: 'forward',
    });
    const { rerender } = renderRow(props);

    // The footer's Retry loads the page that holds the assignment.
    mockAssignments([[assignment()], [later]]);
    const store = configureStore({
      reducer: { GetSimsList: () => mockStoreState.GetSimsList },
    });
    rerender(
      <Provider store={store}>
        <SimsExpandedRow {...props} />
      </Provider>
    );

    expect(
      within(screen.getByTestId('sim-reports-modal')).getByText('Later Sim')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Later Sim')[0]?.closest('tr')).toHaveClass(
      'bg-[#e9e9e9]'
    );
  });

  it('gives up once every page has loaded without the assignment', () => {
    mockAssignments([[assignment()]], { hasNextPage: false });
    renderRow({ defaultSimReportsId: 'sim-missing' });
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sim-reports-modal')).not.toBeInTheDocument();
  });
});

describe('SimsExpandedRow – in-row date editing', () => {
  // Open until 2099, so its dates can be edited.
  const activeAssignment = () =>
    assignment({
      classSimulationId: 'assign-active',
      simName: 'Active Sim',
      startDate: '2020-01-01',
      dueDate: '2099-01-15',
      closeDate: '2099-01-20',
    });

  const dueDateButton = () =>
    screen.getByRole('button', {
      name: 'Edit due date for Active Sim, currently 01-15-2099',
    });

  it('saves an edited date through the update API', async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () => Promise.resolve({ id: 'assign-active' }),
    });
    mockAssignments([[activeAssignment()]]);
    renderRow();

    fireEvent.click(dueDateButton());
    const input = screen.getByLabelText('Edit due date for Active Sim');
    fireEvent.change(input, { target: { value: '2099-01-18' } });

    await vi.waitFor(() =>
      expect(
        screen.queryByLabelText('Edit due date for Active Sim')
      ).not.toBeInTheDocument()
    );
    expect(updateClassSimulation).toHaveBeenCalledWith({
      id: 'assign-active',
      body: { dueDate: '2099-01-18' },
    });
  });

  it("reloads the legacy assignments list after a save (Add's overlap check reads it)", async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () => Promise.resolve({ id: 'assign-active' }),
    });
    mockAssignments([[activeAssignment()]]);
    renderRow();
    vi.mocked(FetchSimulationsByClass).mockClear();

    fireEvent.click(dueDateButton());
    fireEvent.change(screen.getByLabelText('Edit due date for Active Sim'), {
      target: { value: '2099-01-18' },
    });

    await vi.waitFor(() =>
      expect(FetchSimulationsByClass).toHaveBeenCalledWith({
        classId: 'class-1',
      })
    );
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'simulations/getByClass',
    });
  });

  it("doesn't reload the legacy list when the save is refused", async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 400, data: { message: 'Class is archived' } }),
    });
    mockAssignments([[activeAssignment()]]);
    renderRow();
    vi.mocked(FetchSimulationsByClass).mockClear();

    fireEvent.click(dueDateButton());
    fireEvent.change(screen.getByLabelText('Edit due date for Active Sim'), {
      target: { value: '2099-01-18' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Class is archived'
    );
    expect(FetchSimulationsByClass).not.toHaveBeenCalled();
  });

  it('blocks an invalid date and keeps the edit open', async () => {
    mockAssignments([[activeAssignment()]]);
    renderRow();

    fireEvent.click(dueDateButton());
    const input = screen.getByLabelText('Edit due date for Active Sim');
    fireEvent.change(input, { target: { value: '2099-01-25' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Must be on or before the close date (01-20-2099).'
    );
    expect(updateClassSimulation).not.toHaveBeenCalled();
  });

  it('keeps a typed date that fails validation open with its message on blur', async () => {
    mockAssignments([[activeAssignment()]]);
    renderRow();

    fireEvent.click(dueDateButton());
    const input = screen.getByLabelText('Edit due date for Active Sim');
    fireEvent.keyDown(input, { key: '2' });
    fireEvent.change(input, { target: { value: '2099-01-25' } });
    expect(updateClassSimulation).not.toHaveBeenCalled();
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Must be on or before the close date (01-20-2099).'
    );
    expect(
      screen.getByLabelText('Edit due date for Active Sim')
    ).toBeInTheDocument();
    expect(updateClassSimulation).not.toHaveBeenCalled();
  });

  it("shows the backend's message when the save is refused", async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 400, data: { message: 'Class is archived' } }),
    });
    mockAssignments([[activeAssignment()]]);
    renderRow();

    fireEvent.click(dueDateButton());
    const input = screen.getByLabelText('Edit due date for Active Sim');
    fireEvent.change(input, { target: { value: '2099-01-18' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Class is archived'
    );
  });

  it('offers no date editing on an archived class', () => {
    mockAssignments([[activeAssignment()]]);
    renderRow({ isClassArchived: true });

    expect(screen.getByText('01-15-2099').tagName).toBe('TD');
    expect(
      screen.queryByRole('button', { name: /^Edit .* date/ })
    ).not.toBeInTheDocument();
  });
});

describe('SimsExpandedRow – Past assignments are closed', () => {
  it("shows a Past assignment's dates as plain text", () => {
    mockAssignments([[assignment()]]);
    renderRow();

    expect(screen.getByText('01-15-2020').tagName).toBe('TD');
    expect(
      screen.queryByRole('button', { name: /^Edit .* date/ })
    ).not.toBeInTheDocument();
  });

  it("disables only Edit in a Past assignment's menu", () => {
    mockAssignments([[assignment()]]);
    renderRow();
    fireEvent.click(screen.getByText('···'));

    expect(screen.getByText('Edit Assignment Details')).toBeDisabled();
    expect(screen.getByText('Delete Sim Assignment')).not.toBeDisabled();
    expect(screen.getByText('Export Grades')).not.toBeDisabled();
  });

  it('keeps Edit enabled for an assignment that is still open', () => {
    mockAssignments([[assignment({ closeDate: '2099-01-20' })]]);
    renderRow();
    fireEvent.click(screen.getByText('···'));

    expect(screen.getByText('Edit Assignment Details')).not.toBeDisabled();
  });
});

describe('SimsExpandedRow – class availability', () => {
  const createButton = () =>
    screen.getByRole('button', { name: /Create Simulation Assignment/ });

  it('disables Create Simulation Assignment once the class has ended, and says why', () => {
    renderRow({ availability: 'ended' });

    expect(createButton()).toBeDisabled();
    fireEvent.mouseEnter(createButton().parentElement as HTMLElement);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "This class has ended, so simulations can't be assigned to it."
    );
  });

  it('keeps it enabled for an inactive class, with a note', () => {
    renderRow({ availability: 'inactive' });

    expect(createButton()).toBeEnabled();
    fireEvent.focus(createButton());
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "This class is inactive. Students can't access it until it's active."
    );
  });

  it('shows no note for an open class', () => {
    renderRow();

    expect(createButton()).toBeEnabled();
    fireEvent.mouseEnter(createButton());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
