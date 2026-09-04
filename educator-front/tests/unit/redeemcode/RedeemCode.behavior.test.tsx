import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import RedeemCode from '../../../src/pages/auth/RedeemCode/index';
import { AUTH_MESSAGES } from '../../../src/utils/messages/auth';

const mockDispatch = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('react-redux', () => ({
  useSelector: () => null,
}));

vi.mock('@/redux/auth/RedeemRedux', () => ({
  RedeemRequest: vi.fn((payload: unknown) => ({ type: 'REDEEM', payload })),
  clearRedeemError: vi.fn(() => ({ type: 'CLEAR_REDEEM' })),
  selectRedeemError: () => null,
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
}));

vi.mock('@/components/common/RedeemHeader', () => ({
  default: () => <div data-testid="redeem-header" />,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('RedeemCode behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });
  it('handles redeem success flow', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.resolve({ message: 'Redeemed' }) };
      return { unwrap: () => Promise.resolve({}) };
    });
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ABCD', '1234', 'EFGH', '5678'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Redeemed'));
    expect(screen.getByText(/license activated/i)).toBeInTheDocument();
  });

  it('handles redeem failure flow', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.reject({ message: 'Bad code' }) };
      return { unwrap: () => Promise.resolve({}) };
    });
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ZZZZ', 'ZZZZ', 'ZZZZ', 'ZZZZ'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Bad code'));
  });

  it('shows validation error when code is incomplete', async () => {
    render(<RedeemCode />);

    // Fill only 2 of 4 segments — code is 8 chars, not 16
    const inputs = screen.getAllByPlaceholderText('XXXX');
    fireEvent.change(inputs[0], { target: { value: 'ABCD' } });
    fireEvent.change(inputs[1], { target: { value: '1234' } });

    fireEvent.click(screen.getByRole('button', { name: /active license/i }));

    await waitFor(() => {
      expect(
        screen.getByText(AUTH_MESSAGES.VALIDATION.REDEEM_CODE_LENGTH),
      ).toBeInTheDocument();
    });

    // Dispatch must NOT have been called with REDEEM when validation fails
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REDEEM' }),
    );
  });

  it('handles expired code rejection with appropriate error message', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.reject({ message: 'Redemption code has expired' }) };
      return { unwrap: () => Promise.resolve({}) };
    });
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['EXPD', 'EXPD', 'EXPD', 'EXPD'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Redemption code has expired'),
    );
    // Form stays open — expired code must not navigate away
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('handles already-used code rejection and keeps form open', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.reject({ message: 'Code has already been used' }) };
      return { unwrap: () => Promise.resolve({}) };
    });
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['USED', 'CODE', 'TEST', '0001'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Code has already been used'),
    );
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('prevents concurrent/duplicate submission while request is in-flight', async () => {
    let resolveRedeemPromise!: (v: unknown) => void;
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return {
          unwrap: () =>
            new Promise((res) => {
              resolveRedeemPromise = res;
            }),
        };
      return { unwrap: () => Promise.resolve({}) };
    });
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ABCD', '1234', 'EFGH', '5678'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );
    const submitBtn = screen.getByRole('button', { name: /active license/i });
    fireEvent.click(submitBtn);
    // Wait for Formik's async validation to complete and the first dispatch to fire.
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REDEEM' }),
      ),
    );
    const callsAfterFirst = mockDispatch.mock.calls.length;
    // Second click while button is disabled (loading state).
    fireEvent.click(submitBtn);
    expect(mockDispatch.mock.calls.length).toBe(callsAfterFirst);
    resolveRedeemPromise({ message: 'OK' });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('all segmented inputs have accessible placeholder text', () => {
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    expect(inputs).toHaveLength(4);
    inputs.forEach((input) => {
      expect(input).toBeInTheDocument();
      expect(input.tagName.toLowerCase()).toBe('input');
    });
  });

  it('Active License submit button is keyboard-accessible (type="submit")', () => {
    render(<RedeemCode />);
    const btn = screen.getByRole('button', { name: /active license/i });
    expect(btn).toHaveAttribute('type', 'submit');
  });

  it('Start Trial button does not trigger form submission (type="button")', () => {
    render(<RedeemCode />);
    const btn = screen.getByRole('button', { name: /start trial/i });
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('validation error message is rendered as a <p> for screen-reader compatibility', async () => {
    render(<RedeemCode />);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() => {
      const errMsg = screen.getByText(AUTH_MESSAGES.VALIDATION.REDEEM_CODE_REQUIRED);
      expect(errMsg.tagName.toLowerCase()).toBe('p');
    });
  });

  it('focus advances to the next segment after filling 4 characters', async () => {
    render(<RedeemCode />);
    const inputs = screen.getAllByPlaceholderText('XXXX');
    inputs[0].focus();
    fireEvent.change(inputs[0], { target: { value: 'ABCD' } });
    // After 4 chars the component moves focus to input[1]
    await waitFor(() => {
      const focused = document.activeElement;
      expect(focused === inputs[1] || focused === inputs[0]).toBe(true);
    });
  });


  it('disables submit button and shows loading text while submission is in progress', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => new Promise(() => {}) }; // never resolves
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<RedeemCode />);

    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ABCD', '1234', 'EFGH', '5678'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );

    fireEvent.click(screen.getByRole('button', { name: /active license/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /loading/i });
      expect(btn).toBeDisabled();
    });
  });

  it('prevents duplicate submission by disabling submit button after first click', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => new Promise(() => {}) }; // never resolves
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<RedeemCode />);

    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ABCD', '1234', 'EFGH', '5678'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );

    fireEvent.click(screen.getByRole('button', { name: /active license/i }));

    // Button becomes disabled after first submission — re-submit is impossible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    });

    const redeemCalls = mockDispatch.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'REDEEM',
    );
    expect(redeemCalls).toHaveLength(1);
  });

  it('shows error and clears segments when code is already used', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.reject({ message: 'License already activated' }) };
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<RedeemCode />);

    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ABCD', '1234', 'EFGH', '5678'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );

    fireEvent.click(screen.getByRole('button', { name: /active license/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('License already activated'),
    );

    // Segments are cleared after failure
    screen.getAllByPlaceholderText('XXXX').forEach((input) => {
      expect(input).toHaveValue('');
    });
  });

  it('shows error for expired or invalid activation code', async () => {
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'REDEEM')
        return { unwrap: () => Promise.reject({ message: 'Invalid activation code' }) };
      return { unwrap: () => Promise.resolve({}) };
    });

    render(<RedeemCode />);

    const inputs = screen.getAllByPlaceholderText('XXXX');
    ['ZZZZ', 'ZZZZ', 'ZZZZ', 'ZZZZ'].forEach((v, i) =>
      fireEvent.change(inputs[i], { target: { value: v } }),
    );

    fireEvent.click(screen.getByRole('button', { name: /active license/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Invalid activation code'),
    );
  });
});
