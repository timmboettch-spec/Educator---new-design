import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import '../../../src/i18n';
import SimsExpandedRow from '../../../src/components/class/Simsubtable';
import type { ClassSimulationListItemResDto } from '../../../src/redux/api/classSimulations/classSimulations.types';

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

/** Mocks the listing query with one page of assignments. */
const mockAssignments = (data: ClassSimulationListItemResDto[]) =>
  useGetClassSimulationsInfiniteQuery.mockReturnValue({
    currentData: {
      pages: [
        {
          data,
          meta: {
            total: data.length,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      ],
    },
    isFetching: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });

beforeEach(() => mockAssignments([]));

const markAll = vi.fn();
vi.mock('../../../src/hooks/useMarkAllSimReports', () => ({
  useMarkAllSimReports: () => ({ markAll, isMarking: false }),
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
      sim,
      onClose,
      onDeleted,
    }: {
      sim: { simulation_title: string; avatarEnabled?: boolean };
      onClose: () => void;
      onDeleted: () => void;
    }) => (
      <div data-testid="delete-sim-modal">
        <span>{sim.simulation_title}</span>
        <span>{`avatar:${String(sim.avatarEnabled)}`}</span>
        <button onClick={onClose}>Cancel Delete</button>
        <button onClick={onDeleted}>Confirm Delete</button>
      </div>
    ),
  })
);

vi.mock('../../../src/components/class/simulation/EditSimulationModal', () => ({
  EditSimulationModal: ({
    sim,
    onClose,
  }: {
    sim: {
      simulation_title: string;
      unit_name: string;
      avatarEnabled?: boolean;
    };
    onClose: () => void;
  }) => (
    <div data-testid="edit-sim-modal">
      <span>{sim.simulation_title}</span>
      <span>{`unit:${sim.unit_name}`}</span>
      <span>{`avatar:${String(sim.avatarEnabled)}`}</span>
      <button onClick={onClose}>Close Edit</button>
    </div>
  ),
}));

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

// The real modal frame (focus trap, Escape, focus restore) around the props the row passes.
vi.mock(
  '../../../src/components/class/simulation/SimulationReportsModal',
  async () => {
    const { default: Modal } = await vi.importActual<
      typeof import('../../../src/components/ui/Modal')
    >('../../../src/components/ui/Modal');
    return {
      default: ({
        schoolName,
        className,
        simName,
        simulationId,
        classId,
        onClose,
      }: {
        schoolName?: string;
        className?: string;
        simName: string;
        simulationId: string;
        classId: string;
        onClose: () => void;
      }) => (
        <Modal isOpen onClose={onClose} title="Reports">
          <p>School: {schoolName}</p>
          <p>Class: {className}</p>
          <p>Simulation: {simName}</p>
          <p>
            ids: {classId}/{simulationId}
          </p>
        </Modal>
      ),
    };
  }
);

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

/** Report ids the educator has already opened. */
const viewedReportIds: string[] = [];

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  GetClassSimulationReports: vi.fn(() => ({ type: 'simsCompleted/getClass' })),
  selectClassReports: () => [],
  selectClassReportsStatus: () => 'idle',
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ ...mockStoreState, GetClass: { viewedReportIds } }),
}));

vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(() => ({ type: 'simulations/getByClass' })),
  selectSimulationsByClassId:
    (classId: string) =>
    (state: {
      GetSimsList: { simulationsByClass: Record<string, unknown[]> };
    }) =>
      state.GetSimsList.simulationsByClass[classId] ?? [],
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

let mockStoreState: {
  GetSimsList: {
    simulationsByClass: Record<string, unknown[]>;
    status: string;
    error: null;
  };
} = { GetSimsList: { simulationsByClass: {}, status: 'idle', error: null } };

const renderRow = (
  classId = 'class-1',
  className = 'Math 101',
  simsState?: unknown,
  schoolName?: string
) => {
  const state = simsState ?? {
    simulationsByClass: {},
    status: 'idle',
    error: null,
  };
  mockStoreState = {
    GetSimsList: state as (typeof mockStoreState)['GetSimsList'],
  };
  const store = configureStore({ reducer: { GetSimsList: () => state } });
  return render(
    <Provider store={store}>
      <SimsExpandedRow
        classId={classId}
        className={className}
        assignContext={{
          id: classId,
          name: className,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          studentsCount: 0,
          schoolId: 'school-1',
          schoolName: 'North High',
        }}
        schoolName={schoolName}
        students={[]}
      />
    </Provider>
  );
};
describe('SimsExpandedRow – Table Structure', () => {
  it('renders all table column headers', () => {
    renderRow();
    [
      'Sim Name',
      'Start Date',
      'Due Date',
      'Close Date',
      'Assignment Status',
      'Reports / Transcripts',
      'Actions',
    ].forEach((h) => expect(screen.getByText(h)).toBeInTheDocument());
  });
  it('shows the archived-simulation legend in the Sim Name header', () => {
    renderRow();
    expect(screen.getByText('Archived Simulation')).toBeInTheDocument();
  });
  it('renders add simulation action', () => {
    renderRow();
    expect(
      screen.getByText(/create simulation assignment/i)
    ).toBeInTheDocument();
  });
});

const mockAssignment: ClassSimulationListItemResDto = {
  classSimulationId: 'sim-1',
  simId: 'simlib-1',
  simName: 'Alpha Sim',
  isArchived: false,
  startDate: '01-01-2024',
  dueDate: '01-15-2099',
  // Still open: a Past assignment can't be edited.
  closeDate: '01-31-2099',
  startedCount: 0,
  completedCount: 0,
  averageScore: null,
  avatarEnabled: true,
  unitId: 'unit-1',
  unitName: 'Unit One',
};

const renderRowWithSim = (
  overrides: Partial<ClassSimulationListItemResDto> = {}
) => {
  mockAssignments([{ ...mockAssignment, ...overrides }]);
  return renderRow();
};

describe('SimsExpandedRow – Action Menu', () => {
  it('opens dropdown menu when ··· button is clicked', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));

    expect(screen.getByText('Edit Assignment Details')).toBeInTheDocument();
    expect(screen.getByText('View Sim Details')).toBeInTheDocument();
    expect(screen.getByText('Delete Sim Assignment')).toBeInTheDocument();
  });

  it('falls back to the assignment id when simulation_id is empty', () => {
    markAll.mockClear();
    renderRowWithSim({ simId: '' });
    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Mark All Reports Reviewed'));

    expect(markAll).toHaveBeenCalledWith('class-1', 'sim-1', true);
  });

  it('marks an archived simulation with the legend dot', () => {
    renderRowWithSim({ isArchived: true });
    const dot = screen.getByRole('img', { name: 'Archived Simulation' });
    expect(dot.parentElement).toHaveTextContent('Alpha Sim');
  });

  it('shows no archived dot for an active simulation', () => {
    renderRowWithSim();
    expect(
      screen.queryByRole('img', { name: 'Archived Simulation' })
    ).not.toBeInTheDocument();
  });

  it('adds Export Transcripts and the mark-all review actions', () => {
    renderRowWithSim();
    fireEvent.click(screen.getByText('···'));

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim());
    const at = (label: string) => labels.indexOf(label);
    expect(at('Export Transcripts')).toBeGreaterThan(at('Export Reports'));
    expect(at('Mark All Reports Reviewed')).toBe(at('Export Transcripts') + 1);
    expect(at('Mark All Reports Unreviewed')).toBe(
      at('Mark All Reports Reviewed') + 1
    );
  });

  it.each([
    ['Mark All Reports Reviewed', true],
    ['Mark All Reports Unreviewed', false],
  ])(
    '"%s" reviews the simulation\'s reports in this class only',
    (label, reviewed) => {
      markAll.mockClear();
      renderRowWithSim();
      fireEvent.click(screen.getByText('···'));
      fireEvent.click(screen.getByText(label));

      expect(markAll).toHaveBeenCalledWith('class-1', 'simlib-1', reviewed);
    }
  );

  it('navigates to simulation details when View Sim Details is clicked', async () => {
    mockNavigate.mockClear();
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('View Sim Details'));

    expect(mockNavigate).toHaveBeenCalledWith('/simulationdetails/simlib-1', {
      state: {
        simulationId: 'simlib-1',
        fromClasses: true,
        classId: 'class-1',
        expandType: 'sims',
      },
    });
  });

  it('opens EditSimulationModal when Edit clicked in dropdown', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Edit Assignment Details'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-sim-modal')).toBeInTheDocument();
    });

    // Modal receives the correct simulation
    expect(screen.getByTestId('edit-sim-modal')).toHaveTextContent('Alpha Sim');
    // The unit and category come from the listing API (RE-234).
    expect(screen.getByTestId('edit-sim-modal')).toHaveTextContent(
      'unit:Unit One'
    );
    expect(screen.getByTestId('edit-sim-modal')).toHaveTextContent(
      'avatar:true'
    );
  });

  it('opens DeleteSimulationModal when Delete clicked in dropdown', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('delete-sim-modal')).toHaveTextContent(
      'Alpha Sim'
    );
    // avatarEnabled decides whether Delete deducts a token (RE-234).
    expect(screen.getByTestId('delete-sim-modal')).toHaveTextContent(
      'avatar:true'
    );
  });

  it('closes EditSimulationModal when Close Edit is clicked', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Edit Assignment Details'));
    await waitFor(() =>
      expect(screen.getByTestId('edit-sim-modal')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Close Edit'));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-sim-modal')).not.toBeInTheDocument();
    });
  });

  it('closes DeleteSimulationModal after confirmed delete (view update)', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));
    await waitFor(() =>
      expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => {
      expect(screen.queryByTestId('delete-sim-modal')).not.toBeInTheDocument();
    });
  });

  it('dispatches FetchSimulationsByClass after confirmed delete', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));
    await waitFor(() =>
      expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'simulations/getByClass' })
      );
    });
  });
});

describe('SimsExpandedRow – Reports modal', () => {
  const renderWithSchool = () => {
    mockAssignments([mockAssignment]);
    return renderRow('class-1', 'Math 101', undefined, 'Black Rock School');
  };

  it("opens the Reports modal for the clicked row's school, class and simulation", () => {
    renderWithSchool();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reports / Transcripts' })
    );

    const dialog = screen.getByRole('dialog', { name: 'Reports' });
    expect(dialog).toHaveTextContent('School: Black Rock School');
    expect(dialog).toHaveTextContent('Class: Math 101');
    expect(dialog).toHaveTextContent('Simulation: Alpha Sim');
    // The catalog simulation id, not the assignment id.
    expect(dialog).toHaveTextContent('ids: class-1/simlib-1');
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    renderWithSchool();
    const opener = screen.getByRole('button', {
      name: 'Reports / Transcripts',
    });
    opener.focus();
    fireEvent.click(opener);
    // Focus moves into the dialog first, so closing really has to restore it.
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Reports' })).toHaveFocus()
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(opener).toHaveFocus();
  });
});
