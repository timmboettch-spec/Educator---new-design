import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EditSimulationModal from '../../../src/components/class/simulation/EditSimulationModal';

// ---- Mock dispatch ----
const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector: (state?: unknown) => unknown) => selector()),
}));

// ---- Mock redux modules ----
vi.mock('../../../src/redux/class/UpdateSimRedux', () => ({
  selectUpdateSimLoading: vi.fn(),
  selectUpdateSimSuccess: vi.fn(),
  selectUpdateSimError: vi.fn(),
  selectUpdateSimResponse: vi.fn(),
  clearUpdateSimulationState: vi.fn(() => ({ type: 'clear' })),
  updateSimulationRequest: vi.fn((payload: unknown) => ({ type: 'update', payload })),
}));


vi.mock('../../../src/redux/dashboard/simulationlibrary/addsimulationredux', () => ({
  fetchSimulationsByUnit: vi.fn(() => ({ type: 'fetchByUnit' })),
  clearSimulationsByUnit: vi.fn(() => ({ type: 'clearByUnit' })),
  selectUnitSimulations: vi.fn(),
  selectUnitSimLoading: vi.fn(),
  addSimulation: vi.fn((payload: unknown) => ({ type: 'add', payload })),
  clearAddSimulationState: vi.fn(() => ({ type: 'clearAdd' })),
  selectAddSimLoading: vi.fn(),
  selectAddSimSuccess: vi.fn(),
  selectAddSimError: vi.fn(),
}));

vi.mock('../../../src/redux/class/Getsimulationbyidredux', () => ({
  clearSimulationById: vi.fn(() => ({ type: 'clearById' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

import {
  selectUpdateSimLoading,
  selectUpdateSimSuccess,
  selectUpdateSimError,
  selectUpdateSimResponse,
} from '../../../src/redux/class/UpdateSimRedux';

import {
  selectUnitSimulations,
  selectUnitSimLoading,
  selectAddSimLoading,
  selectAddSimSuccess,
  selectAddSimError,
} from '../../../src/redux/dashboard/simulationlibrary/addsimulationredux';

const defaultProps = {
  sim: {
    id: 'scenario-1',
    simulation_name: 'Test Simulation',
    simulation_title: 'Test Simulation',
    simulation_lib_name: 'Test Simulation',
    start_date: '01-01-2024',
    due_date: '01-05-2024',
    end_date: '01-10-2024',
    unit: 'unit-1',
    unit_name: 'Unit One',
    simulation_id: 'sim-id-1',
    avatarEnabled: true,
    class_id: 'class-1',
    class_name: 'Class A',
    user_id: 'user-1',
    image_url: '',
    created_at: '2024-01-01',
    email: 'test@example.com',
  },
  classId: 'class-1',
  className: 'Class A',
  onClose: vi.fn(),
};

const setDefaultMocks = () => {
  vi.mocked(selectUpdateSimLoading).mockReturnValue(false);
  vi.mocked(selectUpdateSimSuccess).mockReturnValue(false);
  vi.mocked(selectUpdateSimError).mockReturnValue(null);
  vi.mocked(selectUpdateSimResponse).mockReturnValue(null);
  vi.mocked(selectUnitSimulations).mockReturnValue([]);
  vi.mocked(selectUnitSimLoading).mockReturnValue(false);
  vi.mocked(selectAddSimLoading).mockReturnValue(false);
  vi.mocked(selectAddSimSuccess).mockReturnValue(false);
  vi.mocked(selectAddSimError).mockReturnValue(null);
};
describe('SimulationModal (edit mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultMocks();
  });

  it('renders edit simulation modal shell', () => {
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Edit Simulation Assignment')).toBeInTheDocument();
    expect(screen.getByText('Simulation Name')).toBeInTheDocument();
  });

  it('renders all read-only and date fields', () => {
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Unit')).toBeInTheDocument();
    expect(screen.getByText('Product Category')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Close Date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('calls onClose when Back button is clicked', () => {
    render(<EditSimulationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows error toast when Save clicked with no changes made', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    render(<EditSimulationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No changes made.');
    });
  });

  it('dispatches updateSimulationRequest when a date is changed and Save is clicked', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    // Modal uses createPortal \u2014 search the full document, not just container
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(1);

    // Change start date to a different value — makes hasChanges = true
    fireEvent.change(dateInputs[0], { target: { value: '2024-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update' }),
      );
    });
  });

  it('shows success toast and closes modal when update succeeds', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    vi.mocked(selectUpdateSimSuccess).mockReturnValue(true);
    vi.mocked(selectUpdateSimResponse).mockReturnValue({ status: 'SUCCESS', message: 'Simulation updated successfully.' });

    render(<EditSimulationModal {...defaultProps} />);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Simulation updated successfully.');
    });
  });

  it('shows API error banner when apiError is set', () => {
    vi.mocked(selectUpdateSimError).mockReturnValue('Date conflict detected.');
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Date conflict detected.')).toBeInTheDocument();
  });

  it('shows Saving loading state on Save button while request is in progress', () => {
    vi.mocked(selectUpdateSimLoading).mockReturnValue(true);
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });
});
