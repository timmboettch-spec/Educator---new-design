import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import StudentEmailAccessCodeModal from '../../../src/components/class/student/StudentEmailAccessCodeModal';
import { toast } from '../../../src/components/common/Toast';

const mockDispatch = vi.fn();

const mockState = {
  loading: false,
  success: false,
  error: null as string | null,
};

const mockClipboardWriteText = vi.fn();

Object.assign(navigator, {
  clipboard: {
    writeText: mockClipboardWriteText,
  },
});

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      studentEmailAccess: {
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

vi.mock('../../../src/redux/class/StudentEmailAccessRedux', () => ({
  clearEmailAccessCodeState: vi.fn(() => ({
    type: 'CLEAR_EMAIL_ACCESS',
  })),

  sendEmailAccessCodeRequest: vi.fn((payload) => ({
    type: 'SEND_EMAIL_ACCESS',
    payload,
  })),

  selectEmailAccessCodeLoading: (s: {
    studentEmailAccess: { loading: boolean };
  }) => s.studentEmailAccess.loading,

  selectEmailAccessCodeSuccess: (s: {
    studentEmailAccess: { success: boolean };
  }) => s.studentEmailAccess.success,

  selectEmailAccessCodeError: (s: {
    studentEmailAccess: { error: string | null };
  }) => s.studentEmailAccess.error,
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
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    label,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <input
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
      />
    </label>
  ),
}));

vi.mock('../../../src/components/ui/Textarea', () => ({
  default: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <textarea value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  ),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe('StudentEmailAccessCodeModal', () => {
  const onClose = vi.fn();

  const student = {
    id: 'student-row-id',
    student_id: 'STU1234',
    student_name: 'John Doe',
    email: 'john@example.com',
    class_id: 'class-1',
  };

  const renderModal = () =>
    render(<StudentEmailAccessCodeModal student={student} onClose={onClose} />);

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.loading = false;
    mockState.success = false;
    mockState.error = null;
  });

  it('renders access-code modal fields', () => {
    renderModal();

    expect(screen.getByText(/Email Student Code/i)).toBeInTheDocument();

    expect(screen.getByDisplayValue('john@example.com')).toBeDisabled();

    expect(screen.getByText('STU1234')).toBeInTheDocument();
  });

  it('dispatches send with expected payload', () => {
    renderModal();

    fireEvent.change(screen.getByDisplayValue('Student Access Code'), {
      target: {
        value: 'Updated Subject',
      },
    });

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: {
        value: 'Please use this Student code.',
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Send Via Email/i,
      })
    );

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SEND_EMAIL_ACCESS',
        payload: {
          subject: 'Updated Subject',
          message: 'Please use this Student code.',
          accessCode: true,
          class_id: 'class-1',
          student_id: 'student-row-id',
          email: 'john@example.com',
        },
      })
    );
  });

  it('copies code when copy action is clicked', () => {
    renderModal();

    fireEvent.click(screen.getByTitle(/Copy Student code/i));

    expect(mockClipboardWriteText).toHaveBeenCalledWith('student-row-id');
  });

  it('disables back button while loading', () => {
    mockState.loading = true;

    renderModal();

    expect(
      screen.getByRole('button', {
        name: /Back/i,
      })
    ).toBeDisabled();
  });

  it('shows error toast when request fails', async () => {
    mockState.error = 'Failed to send email';

    renderModal();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to send email');
    });
  });

  it('shows success toast and closes modal on success', async () => {
    mockState.success = true;

    renderModal();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Email sent successfully');

      expect(onClose).toHaveBeenCalled();
    });
  });
});
