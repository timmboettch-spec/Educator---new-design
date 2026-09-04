import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AddSimulationModal from '../../../src/components/modal/AddSimulationModal';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDispatch = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector: (state?: unknown) => unknown) => selector()),
}));

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    footer,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
    title?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        {title && <h2>{title}</h2>}
        <div>{children}</div>
        {footer && <div data-testid="modal-footer">{footer}</div>}
      </div>
    );
  },
}));

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({
    label,
    value,
    onChange,
    options,
    placeholder,
    error,
    disabled,
  }: {
    label?: string;
    value?: string;
    onChange?: (val: string) => void;
    options?: { value: string; label: string }[];
    placeholder?: string;
    error?: string;
    disabled?: boolean;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        data-testid={`select-${label ?? placeholder ?? 'field'}`}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span data-testid={`error-${label ?? 'field'}`}>{error}</span>}
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    label,
    value,
    onChange,
    disabled,
    readOnly,
    placeholder,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    disabled?: boolean;
    readOnly?: boolean;
    placeholder?: string;
    type?: string;
    [key: string]: unknown;
  }) => (
    <div>
      {label && <label htmlFor={label}>{label}</label>}
      <input
        id={label}
        data-testid={label ?? 'input'}
        type={type ?? 'text'}
        value={value ?? ''}
        onChange={onChange ?? (() => { })}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    loadingText,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingText?: string;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (loadingText ?? 'Loading...') : children}
    </button>
  ),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
  sonnerToast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
  SESSION_TOAST_KEY: 'app_pending_toast',
  default: () => null,
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/addsimulationredux', () => ({
  addSimulationRequest: vi.fn((payload: unknown) => ({ type: 'addSim/request', payload })),
  clearAddSimulationState: vi.fn(() => ({ type: 'addSim/clear' })),
  clearSimulationsByUnit: vi.fn(() => ({ type: 'simsByUnit/clear' })),
  fetchSimulationsByUnit: vi.fn(() => ({ type: 'simsByUnit/fetch' })),
  selectAddSimLoading: vi.fn(() => false),
  selectAddSimSuccess: vi.fn(() => false),
  selectAddSimError: vi.fn(() => null),
  selectUnitSimulations: vi.fn(() => []),
  selectUnitSimLoading: vi.fn(() => false),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux', () => ({
  fetchMyLibrarySimulations: vi.fn(() => ({ type: 'simLib/fetchMy' })),
  selectSimulationLibraryData: vi.fn(() => []),
}));

vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  FetchClassesRequest: vi.fn(() => ({ type: 'classes/fetch' })),
  selectClasses: vi.fn(() => []),
  selectClassListLoading: vi.fn(() => false),
}));

vi.mock('../../../src/redux/notifications/NotificationsRedux', () => ({
  fetchNotifications: vi.fn(() => ({ type: 'notifications/fetch' })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { selectAddSimLoading } from '../../../src/redux/dashboard/simulationlibrary/addsimulationredux';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSim = {
  id: 'sim-lib-1',
  simulation_id: 'sim-lib-1',
  title: 'Alpha Sim',
  name: 'Alpha Sim',
  unit: 'unit-1',
  unit_name: 'Unit One',
  avatarEnabled: true,
  image: '',
  description: '',
  duration: '',
  assigned: false,
  rating: 0,
  difficulty: 'beginner',
  learnerLevel: 'beginner',
};

// Class-context props: classId provided → no class selector shown
const classCtxProps = {
  isOpen: true,
  onClose: vi.fn(),
  onAssigned: vi.fn(),
  classId: 'class-1',
  classEndDate: '2026-12-31',
  students: [],
};

// Library-context props: no classId → class selector shown
const libCtxProps = {
  isOpen: true,
  onClose: vi.fn(),
  students: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wire dispatch so fetchMyLibrarySimulations returns a scenario and
 *  addSimulationRequest resolves with a success message. */
const setupWithScenarios = (addResponse = { message: 'Simulation added successfully' }) => {
  mockDispatch.mockImplementation((action: { type?: string }) => {
    if (action?.type === 'simLib/fetchMy')
      return { unwrap: () => Promise.resolve({ data: [mockSim] }) };
    if (action?.type === 'addSim/request')
      return { unwrap: () => Promise.resolve(addResponse) };
    return { unwrap: () => Promise.resolve({}) };
  });
};

/** Wait for the simulation dropdown to finish loading. */
const waitForScenariosLoaded = () =>
  waitFor(() =>
    expect(screen.getByTestId('select-Simulation Name')).not.toBeDisabled(),
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddSimulationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectAddSimLoading).mockReturnValue(false);
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  // ── rendering ────────────────────────────────────────────────────────────────

  it('renders modal title and primary action button', () => {
    render(<AddSimulationModal {...classCtxProps} />);
    expect(screen.getByText('Create Simulation Assignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create assignment/i })).toBeInTheDocument();
  });

  it('does not render class selector in class context', () => {
    render(<AddSimulationModal {...classCtxProps} />);
    expect(screen.queryByTestId('select-Class Name')).not.toBeInTheDocument();
  });

  it('renders class selector in library context', async () => {
    render(<AddSimulationModal {...libCtxProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('select-Class Name')).toBeInTheDocument();
    });
  });

  it('calls onClose when Back button is clicked', () => {
    render(<AddSimulationModal {...classCtxProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(classCtxProps.onClose).toHaveBeenCalled();
  });

  // ── validation ───────────────────────────────────────────────────────────────

  it('shows "Simulation Name is required" when submitted without selecting a simulation', async () => {
    setupWithScenarios();
    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(screen.getByText('Simulation Name is required')).toBeInTheDocument();
    });
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addSim/request' }),
    );
  });

  it('shows date validation errors when dates are missing', async () => {
    setupWithScenarios();
    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    // Select a simulation (satisfies simulation validation)
    fireEvent.change(screen.getByTestId('select-Simulation Name'), {
      target: { value: mockSim.id },
    });

    // Do NOT fill due date — submit immediately
    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(screen.getByText('Due date is required')).toBeInTheDocument();
    });
  });

  // ── submission ───────────────────────────────────────────────────────────────

  it('dispatches addSimulationRequest with correct class and simulation ids', async () => {
    setupWithScenarios();
    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    fireEvent.change(screen.getByTestId('select-Simulation Name'), {
      target: { value: mockSim.id },
    });

    // Set due date via the hidden native date input
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-12-15' } }); // index 1 = due

    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'addSim/request' }),
      );
    });

    const call = mockDispatch.mock.calls.find(
      (c: { type?: string }[]) => (c[0] as { type?: string })?.type === 'addSim/request',
    );
    expect((call?.[0] as { payload?: { class_id?: string; simulation_id?: string } })?.payload).toMatchObject({
      class_id: 'class-1',
      simulation_id: mockSim.id,
    });
  });

  it('shows toast.success, calls onAssigned, and closes modal after success', async () => {
    setupWithScenarios();
    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    fireEvent.change(screen.getByTestId('select-Simulation Name'), {
      target: { value: mockSim.id },
    });

    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-12-15' } });

    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Simulation added successfully');
    });
    expect(classCtxProps.onClose).toHaveBeenCalled();
    expect(classCtxProps.onAssigned).toHaveBeenCalled();
  });

  it('shows specific toast.error for duplicate assignment', async () => {
    setupWithScenarios();
    mockDispatch.mockImplementation((action: { type?: string }) => {
      if (action?.type === 'simLib/fetchMy')
        return { unwrap: () => Promise.resolve({ data: [mockSim] }) };
      if (action?.type === 'addSim/request')
        return { unwrap: () => Promise.reject({ message: 'Simulation already assigned to this class' }) };
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    fireEvent.change(screen.getByTestId('select-Simulation Name'), {
      target: { value: mockSim.id },
    });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-12-15' } });

    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'addSim/request' }),
      );
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Simulation already assigned to this class',
      );
    });
  });

  it('shows generic toast.error on unspecified API failure', async () => {
    setupWithScenarios();
    mockDispatch.mockImplementation((action: { type?: string }) => {
      if (action?.type === 'simLib/fetchMy')
        return { unwrap: () => Promise.resolve({ data: [mockSim] }) };
      if (action?.type === 'addSim/request')
        return { unwrap: () => Promise.reject({}) };
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<AddSimulationModal {...classCtxProps} />);
    await waitForScenariosLoaded();

    fireEvent.change(screen.getByTestId('select-Simulation Name'), {
      target: { value: mockSim.id },
    });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-12-15' } });

    fireEvent.click(screen.getByRole('button', { name: /create assignment/i }));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'addSim/request' }),
      );
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Something went wrong');
    });
  });

  it('shows Adding... and disables Create Assignment button while loading', () => {
    vi.mocked(selectAddSimLoading).mockReturnValue(true);
    render(<AddSimulationModal {...classCtxProps} />);
    expect(screen.getByText('Adding...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
  });
});
