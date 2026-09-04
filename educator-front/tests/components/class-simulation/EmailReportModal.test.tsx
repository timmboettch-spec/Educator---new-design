import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailReportModal from '../../../src/components/class/simulation/EmailReportModal';

const mockDispatch = vi.fn();
const onClose = vi.fn();
const mockReduxState = {
  loading: false,
  success: false,
  error: null as string | null,
  responseMessage: null as string | null,
};
const mockClipboardWriteText = vi.fn();

vi.stubGlobal('navigator', {
  clipboard: {
    writeText: mockClipboardWriteText,
  },
});

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      EmailReport: {
        status: mockReduxState.loading
          ? 'loading'
          : mockReduxState.success
            ? 'succeeded'
            : mockReduxState.error
              ? 'failed'
              : 'idle',
        response: mockReduxState.responseMessage
          ? {
              message: mockReduxState.responseMessage,
            }
          : null,
        error: mockReduxState.error,
      },
    }),
}));

vi.mock('../../../src/redux/class/EmailReportRedux', () => ({
  sendEmailReport: vi.fn((p) => ({ type: 'SEND', payload: p })),
  clearEmailReportState: vi.fn(() => ({ type: 'CLEAR' })),
  selectEmailReportLoading: (s: { EmailReport: { status: string } }) =>
    s.EmailReport.status === 'loading',
  selectEmailReportSuccess: (s: { EmailReport: { status: string } }) =>
    s.EmailReport.status === 'succeeded',
  selectEmailReportError: (s: { EmailReport: { error: string | null } }) => s.EmailReport.error,
}));

describe('EmailReportModal', () => {
  const sim = {
    id: '1',
    simulation_name: 'Test Sim',
    class_id: 'class1',
    access_code: 'ABC123',
  };

  const students = [
    {
      student_id: 'stu-1',
      student_name: 'Jane Doe',
      email: 'jane@example.com',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockReduxState.loading = false;
    mockReduxState.success = false;
    mockReduxState.error = null;
    mockReduxState.responseMessage = null;
  });

  it('renders modal with default individual mode', () => {
    render(<EmailReportModal sim={sim} students={[]} onClose={onClose} />);

    expect(screen.getByText(/Email Student Code/i)).toBeInTheDocument();
    expect(screen.getByText(/Individual/i)).toBeInTheDocument();
  });

  it('switches mode individual/bulk', () => {
    render(<EmailReportModal sim={sim} students={[]} onClose={onClose} />);

    fireEvent.click(screen.getByText(/Bulk/i));

    expect(screen.queryByText(/Select a student/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Subject/i)).toBeInTheDocument();
  });

  it('dispatches individual payload after selecting a student', () => {
    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'stu-1' } });
    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello there' },
    });

    fireEvent.click(screen.getByText(/Send Via Email/i));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SEND',
        payload: expect.objectContaining({
          to: 'jane@example.com',
          message: 'Hello there',
        }),
      }),
    );
  });

  it('dispatches bulk payload with class_id', () => {
    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    fireEvent.click(screen.getByText(/Bulk/i));
    fireEvent.click(screen.getByText(/Send Via Email/i));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SEND',
        payload: expect.objectContaining({
          class_id: 'class1',
        }),
      }),
    );
  });

  it('disables actions while loading', () => {
    mockReduxState.loading = true;
    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    expect(screen.getByRole('button', { name: /Back/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sending/i })).toBeDisabled();
  });

  it('shows error toast message when request fails', () => {
    mockReduxState.error = 'email missing';

    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    expect(screen.getByText(/email missing/i)).toBeInTheDocument();
  });

  it('shows generic error toast for non-email errors', () => {
    mockReduxState.error = 'service unavailable';

    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('shows success toast UI when request succeeds', () => {
    mockReduxState.success = true;
    mockReduxState.responseMessage = 'Simulation report sent successfully to the student';

    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    expect(
      screen.getByText(/Simulation report sent successfully to the student/i),
    ).toBeInTheDocument();
  });

  it('closes after success toast timeout and clears state', async () => {
    vi.useFakeTimers();
    mockReduxState.success = true;
    mockReduxState.responseMessage = 'Simulation report sent successfully to the student';

    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    expect(
      screen.getByText(/Simulation report sent successfully to the student/i),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLEAR' }));
  });

  it('copies Student code to clipboard', () => {
    render(<EmailReportModal sim={sim} students={students} onClose={onClose} />);

    fireEvent.click(screen.getByTitle(/Copy Student code/i));

    expect(mockClipboardWriteText).toHaveBeenCalledWith('ABC123');
  });
});
