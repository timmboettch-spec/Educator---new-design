import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from '../../../src/components/common/Toast';
import RegenerateAccessCodeModal from '../../../src/components/class/student/RegenerateAccessCodeModal';
import type { RootState } from '../../../src/store';

const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: vi.fn(),
  useAppSelector: vi.fn(),
}));

const mockUnwrap = vi.fn();

vi.mock('../../../src/redux/class/Student/UpdateStudentCodeRedux', () => ({
  selectUpdateCodeLoading: vi.fn((_state: unknown) => false),
  UpdateStudentCodeRequest: vi.fn(() => ({ unwrap: mockUnwrap })),
}));
import { useAppDispatch, useAppSelector } from '../../../src/store/hooks';

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('../../../public/assets/common/alert_triangle.svg', () => ({
  default: 'alert_triangle.svg',
}));

const mockClose = vi.fn();
const mockSuccess = vi.fn();

const defaultProps = {
  isOpen: true,
  onClose: mockClose,
  studentId: 'stu-001',
  studentName: 'John Doe',
  currentCode: 'ABC123',
  onSuccess: mockSuccess,
};

const setup = (props: Partial<typeof defaultProps> = {}) =>
  render(<RegenerateAccessCodeModal {...defaultProps} {...props} />);

// Component flow: step 0 → step 1 (click Regenerate) → step 2 (click Continue) → dispatch on Confirm
const goToStep2 = () => {
  fireEvent.click(screen.getByRole('button', { name: /regenerate/i })); // 0 → 1
  fireEvent.click(screen.getByRole('button', { name: /continue/i })); // 1 → 2
};

describe('RegenerateAccessCodeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAppDispatch).mockReturnValue(mockDispatch);

    vi.mocked(useAppSelector).mockImplementation(
      (_selector: (state: RootState) => unknown) => false
    );

    mockDispatch.mockReturnValue({ unwrap: mockUnwrap });
    mockUnwrap.mockResolvedValue({});
  });

  // ─── Step 0 ───────────────────────────────────────────────────────────────

  test('renders step 0: WARNING banner, student name, current code', () => {
    setup();
    expect(screen.getByText(/WARNING/i)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('CURRENT CODE')).toBeInTheDocument();
  });

  test('renders Cancel and Regenerate buttons on step 0', () => {
    setup();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /regenerate/i })
    ).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    setup({ isOpen: false });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  test('calls onClose when Cancel is clicked on step 0', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  // ─── Step 1 ───────────────────────────────────────────────────────────────

  test('advances to step 1 and shows step indicators + step 1 message', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    // Component renders step bubbles [1, 2]
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Generate A New Code/i)).toBeInTheDocument();
    expect(
      screen.getByText(/lose access to all simulations/i)
    ).toBeInTheDocument();
  });

  test('Cancel on step 1 calls onClose', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  // ─── Step 2 ───────────────────────────────────────────────────────────────

  test('advances to step 2 showing "Mark All Existing" message', () => {
    setup();
    goToStep2();

    expect(
      screen.getByText(/Mark All Existing Associated Records/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/updated and linked/i)).toBeInTheDocument();
  });

  test('Cancel on step 2 calls onClose', () => {
    setup();
    goToStep2();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  // ─── Confirm / dispatch ───────────────────────────────────────────────────

  test('dispatches UpdateStudentCodeRequest with correct studentId on Confirm', async () => {
    const { UpdateStudentCodeRequest } =
      await import('../../../src/redux/class/Student/UpdateStudentCodeRedux');
    setup();
    goToStep2();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(UpdateStudentCodeRequest).toHaveBeenCalledWith('stu-001');
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  test('on success: shows toast.success, calls onSuccess and onClose', async () => {
    setup();
    goToStep2();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Student code regenerated successfully'
      );
      expect(mockSuccess).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  test('on failure: shows toast.error, does NOT call onSuccess', async () => {
    mockUnwrap.mockRejectedValue(new Error('Network error'));

    setup();
    goToStep2();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error');
    });
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  // ─── Loading state ────────────────────────────────────────────────────────

  test('shows action button disabled when loading=true', () => {
    vi.mocked(useAppSelector).mockReturnValue(true);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i })); // go to step 1

    // On step 1 the action button label is "Continue"; it should be disabled
    const btn = screen.getByRole('button', { name: /continue/i });
    expect(btn).toBeDisabled();
  });

  test('Cancel button is never disabled even when loading', () => {
    vi.mocked(useAppSelector).mockReturnValue(true);
    setup();
    goToStep2(); // reach step 2 (Confirm button)

    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
  });
});
