import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ResetPassWord from '../../../src/pages/auth/ResetPassWord/index';
import { ResetPasswordRequest } from '../../../src/redux/auth/ResetPasswordRedux';
import { sonnerToast } from '../../../src/components/common/Toast';
import { COMMON_VALIDATION } from '../../../src/utils/messages/common';

const mockDispatch = vi.fn();
const mockNavigate = vi.fn();
const mockState = {
  status: 'idle',
  error: null as string | null,
  token: 'verified-token',
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    state: { verified_token: mockState.token },
  }),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) =>
    selector({
      ResetPassword: {
        status: mockState.status,
        error: mockState.error,
      },
    }),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  sonnerToast: {
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../../src/redux/auth/ResetPasswordRedux', () => ({
  ResetPasswordRequest: vi.fn((payload) => ({
    type: 'reset-password/request',
    payload,
  })),
  selectResetPasswordStatus: (s: { ResetPassword: { status: string } }) => s.ResetPassword.status,
  selectResetPasswordError: (s: { ResetPassword: { error: string | null } }) =>
    s.ResetPassword.error,
}));

describe('ResetPassWord form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.status = 'idle';
    mockState.error = null;
    mockState.token = 'verified-token';
  });

  it('redirects to signin when token is missing', async () => {
    mockState.token = '';
    render(<ResetPassWord />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });
  });

  it('blocks submit and shows mismatch error for conflicting passwords', () => {
    render(<ResetPassWord />);

    fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
      target: { value: 'P@ss123!' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
      target: { value: 'Q@bb456!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));

    expect(sonnerToast.error).toHaveBeenCalledWith('Password not matched');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('blocks submit for script-like password content', () => {
    render(<ResetPassWord />);

    fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
      target: { value: "print('hello')" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
      target: { value: "print('hello')" },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));

    expect(sonnerToast.error).toHaveBeenCalledWith('Password cannot include HTML or script-like content');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('submits once corrected after initial validation failure', async () => {
    mockDispatch.mockReturnValueOnce({
      unwrap: () => Promise.resolve({ message: 'Password reset successfully' }),
    });

    render(<ResetPassWord />);

    fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
      target: { value: 'P@ss123!' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
      target: { value: 'Q@bb456!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));
    expect(sonnerToast.error).toHaveBeenCalledWith('Password not matched');

    fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
      target: { value: 'P@ss123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));

    await waitFor(() => {
      expect(ResetPasswordRequest).toHaveBeenCalledWith({
        verified_token: 'verified-token',
        new_password: 'P@ss123!',
      });
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });
  });

  it('renders submission error feedback when API call fails', async () => {
    mockDispatch.mockReturnValueOnce({
      unwrap: () => Promise.reject({ message: 'Reset failed' }),
    });

    render(<ResetPassWord />);
    fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
      target: { value: 'P@ss123!' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
      target: { value: 'P@ss123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));

    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith('Reset failed');
    });
  });

  describe('Password policy enforcement', () => {
    it('shows error when password is empty', () => {
      render(<ResetPassWord />);
      fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));
      expect(sonnerToast.error).toHaveBeenCalledWith('Password is required');
    });

    it.each([
      ['test1234', 'missing uppercase and special character'],
      ['TEST@123', 'missing lowercase'],
      ['TestPass', 'missing number and special character'],
      ['Test1234', 'missing special character'],
      ['Te@1', 'less than 8 characters'],
      ['Short1!', 'only 7 characters'],
      ['allowercase1!', 'missing uppercase'],
      ['VeryLongPassword12345X', 'more than 20 characters'],
    ])('rejects invalid password "%s" (%s)', (invalidPassword) => {
      render(<ResetPassWord />);
      fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
        target: { value: invalidPassword },
      });
      fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
        target: { value: invalidPassword },
      });
      fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));
      expect(sonnerToast.error).toHaveBeenCalledWith(COMMON_VALIDATION.PASSWORD_COMPLEXITY);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it.each([['Test@123'], ['Admin#2024'], ['User$456X'], ['SuperSecret#99'], ['Abcdefg1!']])(
      'accepts valid password "%s"',
      async (validPassword) => {
        mockDispatch.mockReturnValueOnce({
          unwrap: () => Promise.resolve({ message: 'Password reset successfully' }),
        });
        render(<ResetPassWord />);
        fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
          target: { value: validPassword },
        });
        fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
          target: { value: validPassword },
        });
        fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      },
    );

    it('accepts passwords longer than 8 characters', async () => {
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.resolve({ message: 'Password reset successfully' }),
      });
      render(<ResetPassWord />);
      const longPassword = 'MyLongP@ssword123';
      fireEvent.change(screen.getByPlaceholderText(/New Password/i), {
        target: { value: longPassword },
      });
      fireEvent.change(screen.getByPlaceholderText(/Confirm Password/i), {
        target: { value: longPassword },
      });
      fireEvent.click(screen.getByRole('button', { name: /Set Password/i }));
      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
        expect(sonnerToast.error).not.toHaveBeenCalledWith(COMMON_VALIDATION.PASSWORD_COMPLEXITY);
      });
    });
  });
});
