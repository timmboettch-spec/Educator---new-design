import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BulkEmailReportModal from '../../../src/components/class/BulkEmailReportModal';
import { toast } from '../../../src/components/common/Toast';

const mockDispatch = vi.fn();
const mockState = {
  loading: false,
  success: false,
  error: null as string | null,
};

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      StudentEmailReport: {
        loading: mockState.loading,
        success: mockState.success,
        error: mockState.error,
      },
    }),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/redux/class/StudentEmailReportRedux', () => ({
  sendEmailReportRequest: vi.fn((p) => ({ type: 'SEND', payload: p })),
  clearEmailReportState: vi.fn(() => ({ type: 'CLEAR' })),
  selectEmailReportLoading: (s: { StudentEmailReport: { loading: boolean } }) =>
    s.StudentEmailReport.loading,
  selectEmailReportSuccess: (s: { StudentEmailReport: { success: boolean } }) =>
    s.StudentEmailReport.success,
  selectEmailReportError: (s: {
    StudentEmailReport: { error: string | null };
  }) => s.StudentEmailReport.error,
}));

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    loadingText,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    loading: boolean;
    loadingText: string;
  }) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {loading ? loadingText : children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    label,
    id,
    inputClassName: _inputClassName,
    ...props
  }: {
    label?: string;
    id?: string;
    [key: string]: unknown;
  }) => (
    <div>
      {label ? <label htmlFor={id || `input-${label}`}>{label}</label> : null}
      <input
        id={id || (label ? `input-${label}` : undefined)}
        data-testid={
          (props['data-testid'] as string) ||
          (label ? `input-${label}` : 'input')
        }
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Textarea', () => ({
  default: ({
    label,
    value,
    onChange,
    placeholder,
    error,
  }: {
    label: string;
    value: string;
    onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
    placeholder: string;
    error: string | null;
  }) => (
    <div>
      <label htmlFor="textarea-message">{label}</label>
      <textarea
        id="textarea-message"
        data-testid="textarea-message"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      {error && <span data-testid="message-error">{error}</span>}
    </div>
  ),
}));

const typeMessage = (msg = 'Hello students') => {
  fireEvent.change(screen.getByTestId('textarea-message'), {
    target: { value: msg },
  });
};

describe('BulkEmailReportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.loading = false;
    mockState.success = false;
    mockState.error = null;
  });

  describe('Rendering', () => {
    it('renders modal title', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(screen.getByText(/Email Report/i)).toBeInTheDocument();
    });

    it('renders subject input with default value', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(screen.getByTestId('input-Subject')).toHaveValue(
        'Student Progress Report'
      );
    });

    it('renders message textarea empty by default', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(screen.getByTestId('textarea-message')).toHaveValue('');
    });

    it('renders Include PDF checkbox unchecked by default', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(screen.getByLabelText(/Include PDF Report/i)).not.toBeChecked();
    });

    it('renders Send Mail and Back buttons', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(
        screen.getByRole('button', { name: /Send Mail/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    });
  });

  describe('Message validation', () => {
    it('shows error and does NOT dispatch when message is empty', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));
      expect(screen.getByTestId('message-error')).toHaveTextContent(
        'Message is required'
      );
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('shows error when message is only whitespace', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      typeMessage('   ');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));
      expect(screen.getByTestId('message-error')).toBeInTheDocument();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('clears message error once user types valid text', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      // Trigger error first
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));
      expect(screen.getByTestId('message-error')).toBeInTheDocument();
      // Now type valid text
      typeMessage('Hello');
      expect(screen.queryByTestId('message-error')).not.toBeInTheDocument();
    });
  });

  describe('Send Mail', () => {
    it('dispatches sendEmailReport with correct payload', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      typeMessage('Hello students');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SEND',
          payload: expect.objectContaining({
            class_id: '1',
            sendPdf: false,
            message: 'Hello students',
          }),
        })
      );
    });

    it('includes default subject in payload', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      typeMessage('Hello students');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            subject: 'Student Progress Report',
          }),
        })
      );
    });

    it('includes updated subject when changed', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      fireEvent.change(screen.getByTestId('input-Subject'), {
        target: { value: 'New Subject' },
      });
      typeMessage('Hello');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ subject: 'New Subject' }),
        })
      );
    });

    it('passes sendPdf: true when Include PDF is checked', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText(/Include PDF Report/i));
      typeMessage('Hello students');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ sendPdf: true }),
        })
      );
    });

    it('passes sendPdf: false when Include PDF is unchecked', () => {
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      typeMessage('Hello');
      fireEvent.click(screen.getByRole('button', { name: /Send Mail/i }));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ sendPdf: false }),
        })
      );
    });
  });

  describe('Loading state', () => {
    it('shows "Sending..." text and disables button while loading', () => {
      mockState.loading = true;
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(
        screen.getByRole('button', { name: /Sending.../i })
      ).toBeDisabled();
    });

    it('disables Back button while loading', () => {
      mockState.loading = true;
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /Back/i })).toBeDisabled();
    });
  });

  describe('Success state', () => {
    it('shows success toast and calls onClose', async () => {
      const onClose = vi.fn();
      mockState.success = true;
      render(<BulkEmailReportModal classId="1" onClose={onClose} />);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Report sent successfully to all students in the class!'
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('dispatches clearEmailReportState on success', async () => {
      mockState.success = true;
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR' });
      });
    });
  });

  describe('Error state', () => {
    it('shows error toast when request fails', async () => {
      mockState.error = 'delivery delayed';
      render(<BulkEmailReportModal classId="1" onClose={vi.fn()} />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('delivery delayed');
      });
    });

    it('does not call onClose on error', async () => {
      const onClose = vi.fn();
      mockState.error = 'something went wrong';
      render(<BulkEmailReportModal classId="1" onClose={onClose} />);

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Back button', () => {
    it('calls onClose when Back is clicked', () => {
      const onClose = vi.fn();
      render(<BulkEmailReportModal classId="1" onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup on unmount', () => {
    it('dispatches clearEmailReportState on unmount', () => {
      const { unmount } = render(
        <BulkEmailReportModal classId="1" onClose={vi.fn()} />
      );
      unmount();
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR' });
    });
  });
});
