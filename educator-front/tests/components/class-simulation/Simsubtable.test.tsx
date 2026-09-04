import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../src/redux/config.tsx', () => ({
  default: {
    GetSimulationApi: 'http://mock/sims',
    DeleteclassSimsApi: 'http://mock/sims',
    PutclassSimsApi: 'http://mock/sims',
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

vi.mock('../../../src/components/class/simulation/DeleteSimulationModal', () => ({
  default: ({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) => (
    <div data-testid="delete-sim-modal">
      <button onClick={onClose}>Cancel Delete</button>
      <button onClick={onDeleted}>Confirm Delete</button>
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
  useAppSelector: (selector: (s: unknown) => unknown) => selector(mockStoreState),
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

vi.mock('../../../../redux/dashboard/simulationlibrary/addsimulationredux', () => ({
  clearAddSimulationState: vi.fn(() => ({
    type: 'sim/clearAdd',
  })),
}));

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', () => ({
  GetClassSimulationReports: vi.fn(() => ({ type: 'simsCompleted/getClass' })),
  selectClassReports: () => [],
  selectClassReportsStatus: () => 'idle',
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

import SimsExpandedRow from '../../../src/components/class/Simsubtable';

const pastSim = {
  id: 'sim-past',
  simulation_id: 'sim-past',
  simulation_title: 'Past Sim',
  simulation_name: 'Past Sim',
  simulation_lib_name: 'Past Sim',
  unit_name: 'Unit Past',
  avatarEnabled: false,
  start_date: '01-01-2020',
  due_date: '01-15-2020',
  end_date: '01-20-2020',
  class_id: 'class-1',
  class_name: 'Math 101',
  unit: 'Unit Past',

  user_id: 'user-1',
  image_url: '',
  created_at: '',
  email: '',
};

const renderRow = (simsState?: unknown) => {
  const state = simsState ?? {
    simulationsByClass: {},
    status: 'idle',
    error: null,
  };

  const simulationsByClass =
    (state as { simulationsByClass?: Record<string, (typeof pastSim)[]> }).simulationsByClass ?? {};
  const simsForClass = simulationsByClass['class-1'] ?? [];

  mockStoreState = {
    GetSimsList: state as typeof mockStoreState.GetSimsList,
  };

  const store = configureStore({
    reducer: {
      GetSimsList: () => state,
    },
  });

  return render(
    <Provider store={store}>
      <table>
        <tbody>
          <SimsExpandedRow
            classId="class-1"
            className="Math 101"
            simulations={simsForClass}
            students={[]}
          />
        </tbody>
      </table>
    </Provider>,
  );
};

describe('SimsExpandedRow – past sim disabled edit', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('renders past sim row correctly', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const simText = await screen.findByText('Past Sim');
    const row = simText.closest('tr');

    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('border-t');
    expect(row).toHaveClass('border-gray-100');
  });

  it('Edit Assignment Details button is enabled', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const menuButton = await screen.findByText('···');

    fireEvent.click(menuButton);

    const editButton = await screen.findByText('Edit Assignment Details');

    expect(editButton).toBeInTheDocument();
    expect(editButton).not.toBeDisabled();
  });

  it('Edit Assignment Details does not have disabled styling', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const menuButton = await screen.findByText('···');

    fireEvent.click(menuButton);

    const editButton = await screen.findByText('Edit Assignment Details');

    expect(editButton).not.toHaveClass('cursor-not-allowed');
  });

  it('Delete Sim Assignment and Export Grade are enabled', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const menuButton = await screen.findByText('···');

    fireEvent.click(menuButton);

    const deleteBtn = await screen.findByText('Delete Sim Assignment');

    const exportBtn = await screen.findByText('Export Grade');

    expect(deleteBtn).not.toBeDisabled();
    expect(exportBtn).not.toBeDisabled();
  });

  it('due date cell has orange styling', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const dueDateCell = await screen.findByText('01-15-2020');

    expect(dueDateCell).toHaveClass('text-red-500');
  });

  it('end date cell has orange styling', async () => {
    renderRow({
      simulationsByClass: {
        'class-1': [pastSim],
      },
      status: 'succeeded',
      error: null,
    });

    const endDateCell = await screen.findByText('01-20-2020');

    expect(endDateCell).toHaveClass('text-red-500');
  });
});
