import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeEach, vi } from 'vitest';

import SignIn from '../../../src/pages/auth/SignIn/index';
import { COMMON_VALIDATION } from '../../../src/utils/messages/common';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null, search: '' }),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('react-redux', async () => {
  const actual = await vi.importActual('react-redux');

  return {
    ...actual,
    useSelector: vi.fn((selector) =>
      selector({
        auth: {
          rememberedEmail: '',
          status: 'idle',
          error: null,
        },
      }),
    ),
  };
});

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  LoginRequest: vi.fn((payload) => ({
    type: 'LOGIN_REQUEST',
    payload,
  })),
  selectLoginStatus: () => 'idle',
  selectRememberedEmail: () => '',
  setRememberedEmail: vi.fn((email) => ({
    type: 'SET_REMEMBERED_EMAIL',
    payload: email,
  })),
  restoreSession: vi.fn((payload) => ({
    type: 'RESTORE_SESSION',
    payload,
  })),
}));

vi.mock('../../../src/redux/loader/loaderSlice', () => ({
  clearPendingToast: vi.fn(() => ({ type: 'loader/clearPendingToast' })),
}));

vi.mock('../../../src/utils/storage', () => ({
  setAuthData: vi.fn((token: string, user: object) => {
    localStorage.setItem('token', token);
    localStorage.setItem(
      'user',
      JSON.stringify({
        ...user,
        token,
      }),
    );
  }),
  setSecondaryAuthData: vi.fn(),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  SESSION_TOAST_KEY: 'app_pending_toast',
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  sonnerToast: {
    dismiss: vi.fn(),
  },
}));

vi.mock('../../../src/components/logo/Logo', () => ({
  default: () => <div data-testid="logo">Logo</div>,
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

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    placeholder,
    value,
    onChange,
    type,
    name,
  }: {
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    name?: string;
  }) => (
    <input name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} />
  ),
}));

vi.mock('../../../src/components/ui/Checkbox', () => ({
  default: ({
    checked,
    onChange,
    name,
  }: {
    checked: boolean;
    onChange: () => void;
    name: string;
  }) => <input type="checkbox" name={name} checked={checked} onChange={onChange} />,
}));

vi.mock('../../../src/components/modal/ConfirmationModal', () => ({
  default: ({
    isOpen,
    title,
    message,
    cancelText,
    confirmText,
    onCancel,
    onConfirm,
    onClose,
  }: {
    isOpen: boolean;
    title?: string;
    message?: string;
    cancelText: string;
    confirmText: string;
    onCancel: () => void;
    onConfirm: () => void;
    onClose?: () => void;
  }) =>
    isOpen ? (
      <div role="dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <button aria-label="Close" onClick={onClose || onCancel}>
          ×
        </button>
        <button onClick={onCancel}>{cancelText}</button>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

describe('SignIn Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test('renders signin page correctly', () => {
    render(<SignIn />);

    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();

    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();

    expect(screen.getByText(/sign up/i)).toBeInTheDocument();

    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  test('updates input values', () => {
    render(<SignIn />);

    const emailInput = screen.getByPlaceholderText('Email');

    const passwordInput = screen.getByPlaceholderText('Password');

    fireEvent.change(emailInput, {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.change(passwordInput, {
      target: {
        value: '123456',
      },
    });

    expect(emailInput).toHaveValue('test@mail.com');

    expect(passwordInput).toHaveValue('123456');
  });

  test('toggles remember me checkbox', () => {
    render(<SignIn />);

    const checkbox = screen.getByRole('checkbox');

    fireEvent.click(checkbox);

    expect(checkbox as HTMLInputElement).toBeChecked();
  });

  test('shows email and password required validation', () => {
    render(<SignIn />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    expect(screen.getByText(COMMON_VALIDATION.EMAIL_AND_PASSWORD_REQUIRED)).toBeInTheDocument();

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('shows email required validation', () => {
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: '12345678',
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    expect(screen.getByText(COMMON_VALIDATION.EMAIL_REQUIRED)).toBeInTheDocument();
  });

  test('shows invalid email validation', () => {
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'invalid-email',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: '12345678',
      },
    });

    const form = screen.getByPlaceholderText('Email').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(screen.getByText(COMMON_VALIDATION.INVALID_EMAIL)).toBeInTheDocument();
  });

  test('shows password required validation', () => {
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    expect(screen.getByText(COMMON_VALIDATION.PASSWORD_REQUIRED)).toBeInTheDocument();
  });

  test('rejects script-like content in password field', () => {
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: "print('hello')",
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    expect(
      screen.getByText('Password cannot include HTML or script-like content'),
    ).toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('successful login navigates to dashboard', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          message: 'Login successfully',
          data: {
            tokens: {
              accessToken: 'abc123',
            },
            user: {
              is_license_active: true,
            },
          },
        }),
    });

    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: '12345678',
      },
    });

    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin-dashboard', { replace: true });
    });
  });

  test('inactive license redirects to redeem code', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          message: 'Login successfully',
          data: {
            tokens: {
              accessToken: 'abc123',
            },
            user: {
              is_license_active: false,
            },
          },
        }),
    });

    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: '12345678',
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/redeem');
    });
  });

  test('handles login failure', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          message: 'Login failed',
        }),
    });

    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: {
        value: 'test@mail.com',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: {
        value: '12345678',
      },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in/i,
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('navigates to forgot password page', () => {
    render(<SignIn />);

    fireEvent.click(screen.getByText(/forgot password/i));

    expect(mockNavigate).toHaveBeenCalledWith('/forgotpassword');
  });

  test('navigates to signup page', () => {
    render(<SignIn />);

    fireEvent.click(screen.getByText(/sign up/i));

    expect(mockNavigate).toHaveBeenCalledWith('/signup');
  });

  test('pressing Enter in an input submits Sign In form', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          message: 'Login successfully',
          data: {
            tokens: {
              accessToken: 'abc123',
            },
            user: {
              is_license_active: true,
            },
          },
        }),
    });

    const user = userEvent.setup();
    render(<SignIn />);

    await user.type(screen.getByPlaceholderText('Email'), 'test@mail.com');
    await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!{enter}');

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  test('prevents duplicate submit on repeated Enter presses', async () => {
    let resolveLogin: ((value: unknown) => void) | undefined;
    const pendingLogin = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    mockDispatch.mockReturnValue({
      unwrap: () => pendingLogin,
    });

    const user = userEvent.setup();
    render(<SignIn />);

    await user.type(screen.getByPlaceholderText('Email'), 'test@mail.com');
    await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');

    const passwordInput = screen.getByPlaceholderText('Password');
    await user.type(passwordInput, '{enter}{enter}{enter}');

    const loginDispatchCalls = mockDispatch.mock.calls.filter(
      ([action]) => (action as { type?: string })?.type === 'LOGIN_REQUEST',
    );
    expect(loginDispatchCalls).toHaveLength(1);

    resolveLogin?.({
      message: 'Login successfully',
      data: {
        tokens: {
          accessToken: 'abc123',
        },
        user: {
          is_license_active: true,
        },
      },
    });
  });

  describe('Dual-Role Modal', () => {
    test('shows dual-role modal when user has both Administrator and Educator roles', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () =>
          Promise.resolve({
            message: 'Login successfully',
            data: {
              has_dual_role: true,
              tokens: { accessToken: 'admin-token', csrfToken: '' },
              user: { is_license_active: true, role: 'admin' },
              educator_tokens: { accessToken: 'educator-token', csrfToken: '' },
              educator_user: { role: 'educator', full_name: 'Test User' },
            },
          }),
      });

      render(<SignIn />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'dual@mail.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose how you want to continue')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /administrator/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /educator/i })).toBeInTheDocument();
      // Should not navigate yet
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('clicking Educator button logs into Educator portal', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () =>
          Promise.resolve({
            message: 'Login successfully',
            data: {
              has_dual_role: true,
              tokens: { accessToken: 'admin-token', csrfToken: '' },
              user: { is_license_active: true, role: 'admin' },
              educator_tokens: { accessToken: 'educator-token', csrfToken: '' },
              educator_user: { role: 'educator', full_name: 'Test User' },
            },
          }),
      });

      render(<SignIn />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'dual@mail.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose how you want to continue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /educator/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/educator-dashboard', { replace: true });
      });
    });

    test('clicking Administrator button logs into Admin portal', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () =>
          Promise.resolve({
            message: 'Login successfully',
            data: {
              has_dual_role: true,
              tokens: { accessToken: 'admin-token', csrfToken: '' },
              user: { is_license_active: true, role: 'admin' },
              educator_tokens: { accessToken: 'educator-token', csrfToken: '' },
              educator_user: { role: 'educator', full_name: 'Test User' },
            },
          }),
      });

      render(<SignIn />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'dual@mail.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose how you want to continue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /administrator/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin-dashboard', { replace: true });
      });
    });

    test('RWAI-2653: clicking X/Cancel closes modal and returns to login without authenticating', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () =>
          Promise.resolve({
            message: 'Login successfully',
            data: {
              has_dual_role: true,
              tokens: { accessToken: 'admin-token', csrfToken: '' },
              user: { is_license_active: true, role: 'admin' },
              educator_tokens: { accessToken: 'educator-token', csrfToken: '' },
              educator_user: { role: 'educator', full_name: 'Test User' },
            },
          }),
      });

      render(<SignIn />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'dual@mail.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose how you want to continue')).toBeInTheDocument();
      });

      // Find and click the X/close button
      const closeButton = screen.getByLabelText('Close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        // Modal should be closed
        expect(screen.queryByText('Choose how you want to continue')).not.toBeInTheDocument();
      });

      // Should NOT navigate (stays on login page)
      expect(mockNavigate).not.toHaveBeenCalled();

      // Login form should still be visible
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });
  });
});
