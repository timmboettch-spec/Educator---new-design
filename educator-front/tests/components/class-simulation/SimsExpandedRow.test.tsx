import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SimsExpandedRow from '../../../src/components/class/Simsubtable';

vi.mock('../ClassSimulation', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="create-sim-modal">
      <button onClick={onClose}>Close Create</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/simulation/DeleteSimulationModal', () => ({
  default: ({
    sim,
    onClose,
    onDeleted,
  }: {
    sim: { simulation_name: string };
    onClose: () => void;
    onDeleted: () => void;
  }) => (
    <div data-testid="delete-sim-modal">
      <span>{sim.simulation_name}</span>
      <button onClick={onClose}>Cancel Delete</button>
      <button onClick={onDeleted}>Confirm Delete</button>
    </div>
  ),
}));

vi.mock('../../../src/components/class/simulation/EditSimulationModal', () => ({
  default: ({ sim, onClose }: { sim: { simulation_name: string }; onClose: () => void }) => (
    <div data-testid="edit-sim-modal">
      <span>{sim.simulation_name}</span>
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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockDispatch = vi.fn(() => Promise.resolve());

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  GetClassSimulationReports: vi.fn(() => ({ type: 'simsCompleted/getClass' })),
  selectClassReports: () => [],
  selectClassReportsStatus: () => 'idle',
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(mockStoreState),
}));

vi.mock('../../../src/redux/class/GetSimsRedux', () => ({
  FetchSimulationsByClass: vi.fn(() => ({ type: 'simulations/getByClass' })),
  selectSimulationsByClassId:
    (classId: string) =>
      (state: { GetSimsList: { simulationsByClass: Record<string, unknown[]> } }) =>
        state.GetSimsList.simulationsByClass[classId] ?? [],
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

let mockStoreState: {
  GetSimsList: { simulationsByClass: Record<string, unknown[]>; status: string; error: null };
} = { GetSimsList: { simulationsByClass: {}, status: 'idle', error: null } };

const renderRow = (classId = 'class-1', className = 'Math 101', simsState?: unknown) => {
  const state = simsState ?? { simulationsByClass: {}, status: 'idle', error: null };
  mockStoreState = { GetSimsList: state as (typeof mockStoreState)['GetSimsList'] };
  const store = configureStore({ reducer: { GetSimsList: () => state } });
  return render(
    <Provider store={store}>
      <SimsExpandedRow classId={classId} className={className} students={[]} />
    </Provider>,
  );
};
describe('SimsExpandedRow – Table Structure', () => {
  it('renders all table column headers', () => {
    renderRow();
    ['Sim Name', 'Start Date', 'Due Date', 'Close Date', 'Reports', 'Actions'].forEach((h) =>
      expect(screen.getByText(h)).toBeInTheDocument(),
    );
  });
  it('renders add simulation action', () => {
    renderRow();
    expect(screen.getByText(/create simulation assignment/i)).toBeInTheDocument();
  });
});

const mockSim = {
  id: 'sim-1',
  simulation_name: 'Alpha Sim',
  simulation_title: 'Alpha Sim',
  start_date: '01-01-2024',
  due_date: '01-15-2024',
  end_date: '01-31-2024',
  unit: 'unit-1',
  avatarEnabled: true,
  simulation_id: 'simlib-1',
};

const renderRowWithSim = () =>
  renderRow('class-1', 'Math 101', {
    simulationsByClass: { 'class-1': [mockSim] },
    status: 'succeeded',
    error: null,
  });

describe('SimsExpandedRow – Action Menu', () => {
  it('opens dropdown menu when ··· button is clicked', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));

    expect(screen.getByText('Edit Assignment Details')).toBeInTheDocument();
    expect(screen.getByText('View Sim Details')).toBeInTheDocument();
    expect(screen.getByText('Delete Sim Assignment')).toBeInTheDocument();
  });

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
  });

  it('opens DeleteSimulationModal when Delete clicked in dropdown', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('delete-sim-modal')).toHaveTextContent('Alpha Sim');
  });

  it('closes EditSimulationModal when Close Edit is clicked', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Edit Assignment Details'));
    await waitFor(() => expect(screen.getByTestId('edit-sim-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Close Edit'));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-sim-modal')).not.toBeInTheDocument();
    });
  });

  it('closes DeleteSimulationModal after confirmed delete (view update)', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));
    await waitFor(() => expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => {
      expect(screen.queryByTestId('delete-sim-modal')).not.toBeInTheDocument();
    });
  });

  it('dispatches FetchSimulationsByClass after confirmed delete', async () => {
    renderRowWithSim();

    fireEvent.click(screen.getByText('···'));
    fireEvent.click(screen.getByText('Delete Sim Assignment'));
    await waitFor(() => expect(screen.getByTestId('delete-sim-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'simulations/getByClass' }),
      );
    });
  });
});
