import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../src/test/testUtils';
import SignUpPage from '../../../src/pages/auth/SignUp/index';
import { COMMON_VALIDATION } from '../../../src/utils/messages/common';
import * as storageUtils from '../../../src/utils/storage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/', state: null }),
  Navigate: ({ to }: { to: string }) => `Navigate to ${to}`,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
  Routes: ({ children }: { children: React.ReactNode }) => children,
  Route: () => null,
}));

const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector) => selector({})),
}));

vi.mock('../../../src/redux/auth/SignUpRedux', () => ({
  default: {},
  SignUpRequest: vi.fn((data) => ({ type: 'SIGNUP', payload: data })),
  selectSignUpStatus: vi.fn(() => 'idle'),
  logout: vi.fn(() => ({ type: 'SIGNUP/logout' })),
}));

describe('SignUp Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        message: 'Account created successfully',
        data: { user: { id: '1', email: 'test@example.com' } },
      }),
    });
  });

  test('renders all form fields', () => {
    renderWithProviders(<SignUpPage />);
    expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
  });

  test('validates full name is required', async () => {
    renderWithProviders(<SignUpPage />);
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(COMMON_VALIDATION.FULL_NAME_REQUIRED)
        ).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('rejects script-like content in full name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);

    await user.type(
      screen.getByPlaceholderText('Full Name'),
      '<script>alert(1)</script>'
    );
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Full name cannot include HTML, script, or code-like content'
        )
      ).toBeInTheDocument();
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  test('validates email is required', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(COMMON_VALIDATION.EMAIL_REQUIRED)
        ).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('validates email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'invalid-email');
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(COMMON_VALIDATION.INVALID_EMAIL)
        ).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('validates password is required', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(COMMON_VALIDATION.PASSWORD_REQUIRED)
        ).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('validates password length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'short');
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(COMMON_VALIDATION.PASSWORD_LENGTH)
        ).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('truncates password input to 20 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(
      screen.getByPlaceholderText('Password'),
      'VeryLongPassword@12345X'
    );
    expect(screen.getByPlaceholderText('Password')).toHaveValue(
      'VeryLongPassword@123'
    );
  });

  test('rejects code-like content in password field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), "print('hello')");
    await user.type(
      screen.getByPlaceholderText('Confirm Password'),
      "print('hello')"
    );
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(
      () => {
        expect(
          screen.getByText(
            'Password cannot include HTML or script-like content'
          )
        ).toBeInTheDocument();
        expect(mockDispatch).not.toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
  });

  test('validates confirm password matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
    await user.type(
      screen.getByPlaceholderText('Confirm Password'),
      'Q@bb456!'
    );
    const form = screen
      .getByPlaceholderText('Full Name')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(
      screen.getByText(COMMON_VALIDATION.PASSWORD_MISMATCH)
    ).toBeInTheDocument();
  });

  test('successfully submits form with valid data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await act(async () => {
      await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
      await user.type(
        screen.getByPlaceholderText('Confirm Password'),
        'P@ss123!'
      );
    });
    await act(async () => {
      const form = screen
        .getByPlaceholderText('Full Name')
        .closest('form') as HTMLFormElement;
      fireEvent.submit(form);
    });
    await waitFor(
      () => {
        expect(mockDispatch).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('sends fullName, not full_name', async () => {
    const { SignUpRequest } =
      await import('../../../src/redux/auth/SignUpRedux');
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);

    await act(async () => {
      await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
      await user.type(
        screen.getByPlaceholderText('Confirm Password'),
        'P@ss123!'
      );
    });
    await act(async () => {
      const form = screen
        .getByPlaceholderText('Full Name')
        .closest('form') as HTMLFormElement;
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(SignUpRequest).toHaveBeenCalledWith({
        fullName: 'John Doe',
        email: 'test@example.com',
        password: 'P@ss123!',
      });
    });
  });

  test('navigates to login on successful signup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SignUpPage />);
    await act(async () => {
      await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
      await user.type(
        screen.getByPlaceholderText('Confirm Password'),
        'P@ss123!'
      );
    });

    await act(async () => {
      const form = screen
        .getByPlaceholderText('Full Name')
        .closest('form') as HTMLFormElement;
      fireEvent.submit(form);
    });

    await waitFor(() => expect(mockDispatch).toHaveBeenCalled(), {
      timeout: 3000,
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });

    vi.useRealTimers();
  });

  test('persists the auto-authentication token so a hard reload does not strand the user on /login', async () => {
    // Signup auto-authenticates (SignUpRedux returns the login shape) and
    // AppRouter treats the in-memory Redux state as a session, letting the
    // user past /login — but without persisting it here, any hard navigation
    // (e.g. redeem's "Start Trial") wipes that in-memory state and the user
    // is bounced back to /login since no cookie/token was ever stored.
    const setAuthDataSpy = vi
      .spyOn(storageUtils, 'setAuthData')
      .mockImplementation(() => {});
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        message: 'Account created successfully',
        data: {
          tokens: { accessToken: 'signup-token' },
          user: { id: '1', email: 'test@example.com' },
        },
      }),
    });

    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await act(async () => {
      await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
      await user.type(
        screen.getByPlaceholderText('Confirm Password'),
        'P@ss123!'
      );
    });
    await act(async () => {
      const form = screen
        .getByPlaceholderText('Full Name')
        .closest('form') as HTMLFormElement;
      fireEvent.submit(form);
    });

    await waitFor(() =>
      expect(setAuthDataSpy).toHaveBeenCalledWith(
        { accessToken: 'signup-token' },
        { id: '1', email: 'test@example.com' },
        false
      )
    );
    setAuthDataSpy.mockRestore();
  });

  test('does not call setAuthData when the signup response has no tokens', async () => {
    const setAuthDataSpy = vi
      .spyOn(storageUtils, 'setAuthData')
      .mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await act(async () => {
      await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
      await user.type(
        screen.getByPlaceholderText('Confirm Password'),
        'P@ss123!'
      );
    });
    await act(async () => {
      const form = screen
        .getByPlaceholderText('Full Name')
        .closest('form') as HTMLFormElement;
      fireEvent.submit(form);
    });

    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
    expect(setAuthDataSpy).not.toHaveBeenCalled();
    setAuthDataSpy.mockRestore();
  });

  test('navigates to sign in page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  test('pressing Enter in an input submits Sign Up form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);

    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');
    await user.type(
      screen.getByPlaceholderText('Confirm Password'),
      'P@ss123!{enter}'
    );

    await waitFor(
      () => {
        expect(mockDispatch).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('prevents duplicate submit on repeated Enter presses', async () => {
    let resolveSignUp: ((value: unknown) => void) | undefined;
    const pendingSignUp = new Promise((resolve) => {
      resolveSignUp = resolve;
    });

    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockReturnValue(pendingSignUp),
    });

    const user = userEvent.setup();
    renderWithProviders(<SignUpPage />);

    await user.type(screen.getByPlaceholderText('Full Name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'P@ss123!');

    const confirmPasswordInput =
      screen.getByPlaceholderText('Confirm Password');
    await user.type(confirmPasswordInput, 'P@ss123!{enter}{enter}{enter}');

    expect(mockDispatch).toHaveBeenCalledTimes(1);

    resolveSignUp?.({
      message: 'Account created successfully',
      data: { user: { id: '1', email: 'test@example.com' } },
    });
  });
});
