import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Dashboard from '../../../../src/pages/dashboard/admin/index';

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const defaultDashboardData = {
  activeSchools: 2,
  totalSchools: 4,
  classesWithSimsThisWeek: 3,
  activeClasses: 1,
  totalClasses: 8,
  studentsActiveLast30Days: 11,
  totalStudents: 20,
  activeEducators: 5,
  totalEducators: 9,
};

// Mutable reference — tests can override .current before rendering
const mockSelectorState = {
  current: {
    dashboardOverview: { data: { ...defaultDashboardData }, status: 'succeeded', error: null },
    simulationCompletedCount: {
      data: { months: [{ label: 'Jan', value: 2 }], total: 2, status: 'succeeded' },
    },
    // 'loading' keeps the Bar chart visible (component renders Bar when status=loading)
    adminSimulationsReport: { data: [], status: 'loading', error: null },
  },
};

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart" />,
}));

vi.mock('../../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector(mockSelectorState.current),
}));

vi.mock('../../../../src/redux/dashboard/admin/DashboardOverviewRedux', () => ({
  getDashboardOverview: vi.fn(() => ({ type: 'dashboard/getOverview' })),
  selectDashboardOverview: (s: { dashboardOverview: { data: unknown } }) =>
    s.dashboardOverview.data,
  selectDashboardOverviewStatus: (s: { dashboardOverview: { status: string } }) =>
    s.dashboardOverview.status,
  selectDashboardOverviewError: (s: { dashboardOverview: { error: string | null } }) =>
    s.dashboardOverview.error,
}));

vi.mock('../../../../src/redux/dashboard/admin/SimulationCompletedCountRedux', () => ({
  getSimulationCompletedCount: vi.fn(() => ({ type: 'dashboard/getSimCount' })),
  selectSimulationCompletedCount: (s: {
    simulationCompletedCount: { data: { months: unknown[] } };
  }) => s.simulationCompletedCount.data,
  selectSimulationCountTotal: (s: { simulationCompletedCount: { data: { total: number } } }) =>
    s.simulationCompletedCount.data.total,
  selectSimulationCountStatus: (s: { simulationCompletedCount: { data: { status: string } } }) =>
    s.simulationCompletedCount.data.status,
  SimRange: {},
}));

vi.mock('../../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

describe('Admin Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectorState.current = {
      dashboardOverview: { data: { ...defaultDashboardData }, status: 'succeeded', error: null },
      simulationCompletedCount: {
        data: { months: [{ label: 'Jan', value: 2 }], total: 2, status: 'succeeded' },
      },
      adminSimulationsReport: { data: [], status: 'loading', error: null },
    };
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it('renders dashboard sections', () => {
    render(<Dashboard />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('AI Seats')).toBeInTheDocument();
    expect(screen.getByText('Simulation Completed')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('shows dash placeholder while simulation data is loading', () => {
    mockSelectorState.current = {
      ...mockSelectorState.current,
      adminSimulationsReport: { data: [], status: 'loading', error: null },
    };

    render(<Dashboard />);

    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders correctly with all-zero metric data', () => {
    mockSelectorState.current = {
      dashboardOverview: {
        data: {
          activeSchools: 0,
          totalSchools: 0,
          classesWithSimsThisWeek: 0,
          activeClasses: 0,
          totalClasses: 0,
          studentsActiveLast30Days: 0,
          totalStudents: 0,
          activeEducators: 0,
          totalEducators: 0,
        },
      },
      simulationCompletedCount: {
        data: { months: [], total: 0, status: 'succeeded' },
      },
      // Keep loading so Bar chart renders (avoids empty-chart placeholder path)
      adminSimulationsReport: { data: [], status: 'loading', error: null },
    };

    render(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders correctly with partial metric data', () => {
    mockSelectorState.current = {
      dashboardOverview: {
        data: {
          activeSchools: 3,
          totalSchools: 5,
          classesWithSimsThisWeek: 0,
          activeClasses: 0,
          totalClasses: 0,
          studentsActiveLast30Days: 0,
          totalStudents: 0,
          activeEducators: 2,
          totalEducators: 4,
        },
      },
      simulationCompletedCount: {
        data: { months: [{ label: 'Jan', value: 2 }], total: 2, status: 'succeeded' },
      },
      adminSimulationsReport: { data: [], status: 'loading', error: null },
    };

    render(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('dispatches data-fetch actions on mount', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'dashboard/getOverview' }),
      );
    });

    // AdminSimulationsReportRequest is a real createAsyncThunk — dispatched as a thunk function
    expect(mockDispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('shows loading skeletons while overview data is fetching', () => {
    mockSelectorState.current = {
      ...mockSelectorState.current,
      dashboardOverview: { data: null, status: 'loading', error: null },
    };

    render(<Dashboard />);

    expect(screen.getByTestId('overview-loading')).toBeInTheDocument();
    // Progress cards must NOT render while loading
    expect(screen.queryByText(/schools active/i)).not.toBeInTheDocument();
  });

  it('shows error banner when overview fetch fails', () => {
    mockSelectorState.current = {
      ...mockSelectorState.current,
      dashboardOverview: {
        data: null,
        status: 'failed',
        error: 'Failed to fetch dashboard overview',
      },
    };

    render(<Dashboard />);

    expect(screen.getByTestId('overview-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch dashboard overview')).toBeInTheDocument();
  });

  it('shows empty/zero progress cards when overview succeeds with no data', () => {
    mockSelectorState.current = {
      ...mockSelectorState.current,
      dashboardOverview: {
        data: {
          activeSchools: 0,
          totalSchools: 0,
          classesWithSimsThisWeek: 0,
          activeClasses: 0,
          totalClasses: 0,
          studentsActiveLast30Days: 0,
          totalStudents: 0,
          activeEducators: 0,
          totalEducators: 0,
        },
        status: 'succeeded',
        error: null,
      },
    };

    render(<Dashboard />);

    // Loading skeleton and error banner must be absent
    expect(screen.queryByTestId('overview-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overview-error')).not.toBeInTheDocument();
    // Dashboard heading still present
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('transitions from loading skeleton to populated cards', () => {
    // Step 1: loading state
    mockSelectorState.current = {
      ...mockSelectorState.current,
      dashboardOverview: { data: null, status: 'loading', error: null },
    };

    const { rerender } = render(<Dashboard />);
    expect(screen.getByTestId('overview-loading')).toBeInTheDocument();

    // Step 2: succeeded state with data
    mockSelectorState.current = {
      ...mockSelectorState.current,
      dashboardOverview: { data: { ...defaultDashboardData }, status: 'succeeded', error: null },
    };

    rerender(<Dashboard />);

    expect(screen.queryByTestId('overview-loading')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
