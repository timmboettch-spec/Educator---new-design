import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import i18n from '../../../src/i18n';
import { EditSimulationModal } from '../../../src/components/class/simulation/EditSimulationModal';

// ---- Mock the update mutation ----
const updateClassSimulation = vi.fn();

vi.mock('../../../src/redux/api/classSimulations/classSimulationsApi', () => ({
  useUpdateClassSimulationMutation: () => [updateClassSimulation],
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast,
  SESSION_TOAST_KEY: 'app_pending_toast',
  default: () => null,
}));

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
  onClose: vi.fn(),
};

const resolveSave = () =>
  updateClassSimulation.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        id: 'scenario-1',
        classId: 'class-1',
        simulationId: 'sim-id-1',
      }),
  });

const rejectSave = (error: unknown) =>
  updateClassSimulation.mockReturnValue({
    unwrap: () => Promise.reject(error),
  });

/** The native date input behind the Start Date field (its labelled control). */
const startDateInput = () => screen.getByLabelText(/^Start Date/);

const changeStartAndSave = (value: string) => {
  fireEvent.change(startDateInput(), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
};

describe('EditSimulationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSave();
  });

  it('renders edit simulation modal shell', () => {
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Edit Simulation Assignment')).toBeInTheDocument();
    expect(screen.getByText('Simulation Name')).toBeInTheDocument();
  });

  it('renders all read-only and date fields', () => {
    render(<EditSimulationModal {...defaultProps} />);
    expect(screen.getByText('Unit')).toBeInTheDocument();
    expect(screen.getByText('Simulation Modality')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Close Date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /save changes/i })
    ).toBeInTheDocument();
  });

  it('calls onClose when Back button is clicked', () => {
    render(<EditSimulationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows error toast when Save clicked with no changes made', async () => {
    render(<EditSimulationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No changes made.');
    });
    expect(updateClassSimulation).not.toHaveBeenCalled();
  });

  it('sends the dates, as ISO, to the update API', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2024-01-02');

    await waitFor(() => {
      expect(updateClassSimulation).toHaveBeenCalledWith({
        id: 'scenario-1',
        body: {
          startDate: '2024-01-02',
          dueDate: '2024-01-05',
          endDate: '2024-01-10',
        },
      });
    });
  });

  it('clears later dates a new start passes, and blocks the save', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    // A start after the close date clears the due and close dates.
    changeStartAndSave('2024-01-11');

    expect(await screen.findByText('Due Date is required')).toBeInTheDocument();
    expect(screen.getByText('Close Date is required')).toBeInTheDocument();
    expect(
      screen.getByText('Start Date must be on or before 01-10-2024')
    ).toBeInTheDocument();
    expect(updateClassSimulation).not.toHaveBeenCalled();
  });

  it('shows the schema message for a date outside its limits', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2023-12-31');

    expect(
      await screen.findByText("Start Date can't be earlier than 01-01-2024")
    ).toBeInTheDocument();
    expect(updateClassSimulation).not.toHaveBeenCalled();
  });

  it('submits with Enter through the form', async () => {
    render(<EditSimulationModal {...defaultProps} />);
    fireEvent.change(startDateInput(), { target: { value: '2024-01-02' } });

    const form = document.getElementById('edit-simulation-form');
    if (!form) throw new Error('Form not rendered');
    fireEvent.submit(form);

    await waitFor(() => expect(updateClassSimulation).toHaveBeenCalledTimes(1));
  });

  it('shows success toast and closes modal when update succeeds', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2024-01-02');

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Simulation updated successfully.'
      );
    });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the backend's message when the save is refused", async () => {
    rejectSave({ status: 400, data: { message: 'Date conflict detected.' } });
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2024-01-02');

    expect(
      await screen.findByText('Date conflict detected.')
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('falls back to a friendly message when the save fails without one', async () => {
    rejectSave(new Error('Network Error'));
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2024-01-02');

    expect(
      await screen.findByText('Failed to update simulation.')
    ).toBeInTheDocument();
  });

  it('locks the dialog while the save is in progress', async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () => new Promise(() => {}),
    });
    render(<EditSimulationModal {...defaultProps} />);

    changeStartAndSave('2024-01-02');

    expect(await screen.findByText('Saving...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('shows Spanish copy when the app language is Spanish', async () => {
    await i18n.changeLanguage('es');
    try {
      render(<EditSimulationModal {...defaultProps} />);
      expect(
        screen.getByText('Editar asignación de simulación')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /guardar cambios/i })
      ).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('labels each date input and links its error', async () => {
    render(<EditSimulationModal {...defaultProps} />);

    for (const label of [/^Start Date/, /^Due Date/, /^Close Date/]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('type', 'date');
      expect(input).toHaveAttribute('aria-required', 'true');
    }
    // The MM-DD-YYYY text boxes are visual only.
    expect(screen.getByDisplayValue('01-01-2024')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByDisplayValue('01-01-2024')).toHaveAttribute(
      'tabindex',
      '-1'
    );

    changeStartAndSave('2023-12-31');

    const message = await screen.findByText(
      "Start Date can't be earlier than 01-01-2024"
    );
    expect(startDateInput()).toHaveAttribute('aria-invalid', 'true');
    expect(startDateInput()).toHaveAttribute('aria-describedby', message.id);
  });

  it('sends one save when Enter is pressed again while saving', async () => {
    updateClassSimulation.mockReturnValue({
      unwrap: () => new Promise(() => {}),
    });
    render(<EditSimulationModal {...defaultProps} />);
    const form = document.getElementById('edit-simulation-form');
    if (!form) throw new Error('Form not rendered');

    changeStartAndSave('2024-01-02');
    expect(await screen.findByText('Saving...')).toBeInTheDocument();

    // Enter in the read-only Simulation Name field submits the form again.
    // Formik validates before submitting, so let those submits settle.
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(updateClassSimulation).toHaveBeenCalledTimes(1);
  });
});
