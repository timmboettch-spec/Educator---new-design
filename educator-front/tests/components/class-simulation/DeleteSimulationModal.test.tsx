import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import DeleteSimulationModal from '../../../src/components/class/simulation/DeleteSimulationModal';

// ─────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/redux/class/DeleteSimulationRedux', () => ({
  DeleteSimulationRequest: Object.assign(vi.fn(), {
    fulfilled: {
      match: vi.fn(),
    },
  }),
}));

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    children,
    footer,
    title,
    isOpen,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
    title: string;
    isOpen: boolean;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

// ─────────────────────────────────────────────────────────────
// Mocked imports
// ─────────────────────────────────────────────────────────────

import { toast } from '../../../src/components/common/Toast';
import { DeleteSimulationRequest } from '../../../src/redux/class/DeleteSimulationRedux';

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockSim = {
  id: 'abc-123',
  simulation_title: 'Test Simulation',
  simulation_id: 'sim-456',
};

const mockClassId = 'class-789';

// ─────────────────────────────────────────────────────────────
// Mock Store
// ─────────────────────────────────────────────────────────────

function createMockStore(mockDispatch: ReturnType<typeof vi.fn>) {
  return {
    getState: () => ({}),
    dispatch: mockDispatch,
    subscribe: vi.fn(),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Parameters<typeof Provider>[0]['store'];
}

// ─────────────────────────────────────────────────────────────
// Render Helper
// ─────────────────────────────────────────────────────────────

interface RenderProps {
  mockDispatch?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
  onDeleted?: ReturnType<typeof vi.fn>;
}

const renderComponent = ({
  mockDispatch = vi.fn(),
  onClose = vi.fn(),
  onDeleted = vi.fn(),
}: RenderProps = {}) => {
  render(
    <Provider store={createMockStore(mockDispatch)}>
      <DeleteSimulationModal
        sim={mockSim}
        classId={mockClassId}
        onClose={onClose}
        onDeleted={onDeleted}
      />
    </Provider>,
  );

  return {
    mockDispatch,
    onClose,
    onDeleted,
  };
};

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('DeleteSimulationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with correct title', () => {
    renderComponent();

    expect(
      screen.getByRole('heading', {
        name: /delete sim assignment/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the simulation name in the body', () => {
    renderComponent();

    expect(screen.getByText(/test simulation/i)).toBeInTheDocument();
  });

  it('renders the warning messages', () => {
    renderComponent();

    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();

    expect(screen.getByText(/this will remove access to all reports/i)).toBeInTheDocument();
  });

  it('renders Back and Delete Sim Assignment buttons', () => {
    renderComponent();

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    ).toBeInTheDocument();
  });

  it('calls onClose when Back button is clicked', () => {
    const { onClose } = renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows success toast and closes modal on fulfilled dispatch', async () => {
    const fulfilledAction = {
      type: 'deleteSimulation/fulfilled',
      payload: undefined,
    };

    const mockDispatch = vi.fn().mockResolvedValue(fulfilledAction);

    vi.mocked(DeleteSimulationRequest).mockReturnValue(fulfilledAction);

    vi.mocked(DeleteSimulationRequest.fulfilled.match).mockReturnValue(true);

    const { onClose, onDeleted } = renderComponent({
      mockDispatch,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Simulation deleted successfully!');
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);

    expect(onClose).toHaveBeenCalledTimes(1);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('calls DeleteSimulationRequest with correct payload', async () => {
    const fulfilledAction = {
      type: 'deleteSimulation/fulfilled',
      payload: undefined,
    };

    const mockDispatch = vi.fn().mockResolvedValue(fulfilledAction);

    vi.mocked(DeleteSimulationRequest).mockReturnValue(fulfilledAction);

    vi.mocked(DeleteSimulationRequest.fulfilled.match).mockReturnValue(true);

    renderComponent({ mockDispatch });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    );

    await waitFor(() => {
      expect(DeleteSimulationRequest).toHaveBeenCalledWith({
        simId: mockSim.id,
        classId: mockClassId,
        avatarEnabled: undefined,
        startDate: undefined,
      });
    });
  });

  it('shows payload error message on rejected dispatch', async () => {
    const rejectedAction = {
      type: 'deleteSimulation/rejected',
      payload: 'Simulation not found',
    };

    const mockDispatch = vi.fn().mockResolvedValue(rejectedAction);

    vi.mocked(DeleteSimulationRequest).mockReturnValue(rejectedAction);

    vi.mocked(DeleteSimulationRequest.fulfilled.match).mockReturnValue(false);

    const { onClose, onDeleted } = renderComponent({
      mockDispatch,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Simulation not found');
    });

    expect(onDeleted).not.toHaveBeenCalled();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows generic error toast when payload is undefined', async () => {
    const rejectedAction = {
      type: 'deleteSimulation/rejected',
      payload: undefined,
    };

    const mockDispatch = vi.fn().mockResolvedValue(rejectedAction);

    vi.mocked(DeleteSimulationRequest).mockReturnValue(rejectedAction);

    vi.mocked(DeleteSimulationRequest.fulfilled.match).mockReturnValue(false);

    renderComponent({ mockDispatch });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong while deleting');
    });
  });

  it('shows generic error toast when dispatch throws', async () => {
    const mockDispatch = vi.fn().mockRejectedValue(new Error('Network Error'));

    vi.mocked(DeleteSimulationRequest).mockReturnValue({});

    renderComponent({ mockDispatch });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete sim assignment/i,
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong while deleting');
    });

    expect(toast.success).not.toHaveBeenCalled();
  });
});
