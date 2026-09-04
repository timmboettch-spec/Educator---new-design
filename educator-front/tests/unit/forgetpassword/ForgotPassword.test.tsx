import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import ForgotPassWord from '../../../src/pages/auth/ForgotPassWord/index';

// ─────────────────────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────────────────────

const { mockNavigate, mockDispatch, mockForgotPasswordRequest, mockResetError, mockIsValidEmail } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockDispatch: vi.fn(),

    mockForgotPasswordRequest: vi.fn((payload) => ({
      type: 'auth/ForgotPassword',
      payload,
    })),

    mockResetError: vi.fn(() => ({
      type: 'auth/resetError',
    })),

    mockIsValidEmail: vi.fn(),
  }));

// ─────────────────────────────────────────────────────────────
// Router mock
// ─────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─────────────────────────────────────────────────────────────
// Store hooks mock
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

// ─────────────────────────────────────────────────────────────
// Forgot password redux mock
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/redux/auth/ForgotPasswordRedux', () => ({
  ForgotPasswordRequest: mockForgotPasswordRequest,

  resetError: mockResetError,

  selectForgotPasswordStatus: (state: { ForgotPassword: { status: string } }) =>
    state.ForgotPassword.status,

  selectForgotPasswordError: (state: { ForgotPassword: { error: string | null } }) =>
    state.ForgotPassword.error,
}));

// ─────────────────────────────────────────────────────────────
// Component mocks
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/components/logo/Logo', () => ({
  default: () => <div data-testid="logo">Logo</div>,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────
// Validation mock
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/utils/validation', () => ({
  isValidEmail: (email: string) => mockIsValidEmail(email),
}));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const buildStore = (
  overrides: {
    status?: string;
    error?: string | null;
  } = {},
) =>
  configureStore({
    reducer: {
      ForgotPassword: () => ({
        status: overrides.status ?? 'idle',
        error: overrides.error ?? null,
        responseForgotPassword: null,
        rememberedEmail: '',
      }),
    },
  });

const renderPage = (
  storeOverrides: {
    status?: string;
    error?: string | null;
  } = {},
) =>
  render(
    <Provider store={buildStore(storeOverrides)}>
      <MemoryRouter>
        <ForgotPassWord />
      </MemoryRouter>
    </Provider>,
  );

const getValidationErrorEl = () => document.querySelector('p.text-red-500') as HTMLElement | null;

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('ForgotPassWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsValidEmail.mockReturnValue(true);

    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          data: {
            reset_token: 'tok123',
          },
          message: 'OTP sent successfully',
        }),
    });
  });

  // ───────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders forgot password form', () => {
      renderPage();

      expect(screen.getByText('FORGOT PASSWORD')).toBeInTheDocument();
    });

    it('renders logo', () => {
      renderPage();

      expect(screen.getByTestId('logo')).toBeInTheDocument();
    });

    it('renders background image', () => {
      renderPage();

      // Image is decorative (alt=""), so it has role="presentation" — query by alt attribute
      expect(document.querySelector('img[alt=""]')).toBeInTheDocument();
    });

    it('renders back to sign in link', () => {
      renderPage();

      expect(
        screen.getByRole('button', {
          name: /sign in/i,
        }),
      ).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────
  // Email Input
  // ───────────────────────────────────────────────────────────

  describe('Email Input', () => {
    it('updates email input on change', () => {
      renderPage();

      const input = screen.getByPlaceholderText('Email');

      fireEvent.change(input, {
        target: {
          value: 'user@example.com',
        },
      });

      expect(input).toHaveValue('user@example.com');

      expect(mockResetError).toHaveBeenCalled();

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'auth/resetError',
      });
    });

    it('shows validation error for invalid email', async () => {
      mockIsValidEmail.mockReturnValue(false);

      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: {
          value: 'invalid-email',
        },
      });

      // clear resetError dispatch call from change event
      mockDispatch.mockClear();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /send otp/i,
          }),
        );
      });

      await waitFor(() => {
        expect(getValidationErrorEl()).not.toBeNull();
      });

      expect(mockForgotPasswordRequest).not.toHaveBeenCalled();

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('shows validation error for empty email', async () => {
      mockIsValidEmail.mockReturnValue(false);

      renderPage();

      mockDispatch.mockClear();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /send otp/i,
          }),
        );
      });

      await waitFor(() => {
        expect(getValidationErrorEl()).not.toBeNull();
      });

      expect(mockForgotPasswordRequest).not.toHaveBeenCalled();

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('clears validation error when user types in email field', async () => {
      mockIsValidEmail.mockReturnValue(false);

      renderPage();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /send otp/i,
          }),
        );
      });

      await waitFor(() => {
        expect(getValidationErrorEl()).not.toBeNull();
      });

      mockIsValidEmail.mockReturnValue(true);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: {
          value: 'user@example.com',
        },
      });

      await waitFor(() => {
        expect(mockResetError).toHaveBeenCalled();
      });
    });
  });

  // ───────────────────────────────────────────────────────────
  // Submit behavior
  // ───────────────────────────────────────────────────────────

  describe('Submit behavior', () => {
    it('shows loading state when submitting', () => {
      renderPage({
        status: 'loading',
      });

      expect(screen.getByText('Signing up...')).toBeInTheDocument();
    });

    it('navigates to otp verify on successful submission', async () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: {
          value: 'user@example.com',
        },
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /send otp/i,
          }),
        );
      });

      await waitFor(() => {
        expect(mockForgotPasswordRequest).toHaveBeenCalledWith({
          email: 'user@example.com',
        });

        expect(mockNavigate).toHaveBeenCalledWith('/otpverify', {
          state: {
            token: 'tok123',
          },
        });
      });
    });

    it('displays api error message when request fails', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server error')),
      });

      renderPage({
        status: 'failed',
        error: 'Email not found',
      });

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: {
          value: 'user@example.com',
        },
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /send otp/i,
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Email not found')).toBeInTheDocument();
      });
    });
  });

  // ───────────────────────────────────────────────────────────
  // UI and accessibility
  // ───────────────────────────────────────────────────────────

  describe('UI and accessibility', () => {
    it('button has gradient class', () => {
      renderPage();

      expect(
        screen.getByRole('button', {
          name: /send otp/i,
        }),
      ).toBeInTheDocument();
    });

    it('email input is required', () => {
      renderPage();

      expect(screen.getByPlaceholderText('Email')).toBeRequired();
    });

    it('email input has correct type', () => {
      renderPage();

      expect(screen.getByPlaceholderText('Email')).toHaveAttribute('type', 'email');
    });

    it('renders responsive layout', () => {
      renderPage();

      expect(screen.getByText('FORGOT PASSWORD')).toBeInTheDocument();
    });

    it('sign in button navigates to signin page', () => {
      renderPage();

      fireEvent.click(
        screen.getByRole('button', {
          name: /sign in/i,
        }),
      );

      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });
  });
});
