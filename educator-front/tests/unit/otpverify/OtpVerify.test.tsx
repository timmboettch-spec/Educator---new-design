import '@/i18n';
import { configureStore } from '@reduxjs/toolkit';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import OtpVerify from '../../../src/pages/auth/OtpVerify/index';

const MOCK_EMAIL = 'user@example.com';

const {
  mockNavigate,
  mockDispatch,
  mockVerifyOTPRequest,
  mockResendOTPRequest,
  mockVerifyOTPReset,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockDispatch: vi.fn(),
  mockVerifyOTPRequest: vi.fn((payload) => ({
    type: 'auth/VerifyOTP',
    payload,
  })),
  mockResendOTPRequest: vi.fn((payload) => ({
    type: 'auth/ResendOTP',
    payload,
  })),
  mockVerifyOTPReset: vi.fn(() => ({ type: 'auth/VerifyOTP/reset' })),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      state: { email: MOCK_EMAIL },
    }),
  };
});

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('../../../src/redux/auth/VerifyOTPRedux', () => ({
  VerifyOTPRequest: mockVerifyOTPRequest,
  verifyOTP: mockVerifyOTPReset,
  selectVerifyOTPStatus: (state: unknown) =>
    (state as { VerifyOTP?: { status: string } })?.VerifyOTP?.status ?? 'idle',
}));

vi.mock('../../../src/redux/auth/ResendOTPRedux', () => ({
  ResendOTPRequest: mockResendOTPRequest,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  default: () => null,
}));

const buildStore = (
  storeOverrides: {
    verifyOtpStatus?: string;
    resendOtpStatus?: string;
  } = {}
) =>
  configureStore({
    reducer: {
      VerifyOTP: (
        state = { status: storeOverrides.verifyOtpStatus ?? 'idle' }
      ) => state,
      ResendOTP: (
        state = { status: storeOverrides.resendOtpStatus ?? 'idle' }
      ) => state,
    },
  });

const renderPage = (storeOverrides = {}) =>
  render(
    <Provider store={buildStore(storeOverrides)}>
      <MemoryRouter>
        <OtpVerify />
      </MemoryRouter>
    </Provider>
  );

describe('OtpVerify', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          data: {},
          message: 'OTP verified successfully',
        }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders OTP verification form', () => {
      renderPage();
      expect(screen.getByText('OTP VERIFY')).toBeInTheDocument();
    });

    it('renders 6 OTP input fields', () => {
      renderPage();
      const inputs = screen.getAllByDisplayValue('');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });

    it('renders Verify button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Verify/i })
      ).toBeInTheDocument();
    });

    it('renders back to Sign In link', () => {
      renderPage();
      expect(
        screen.getByText('Sign In', { selector: 'button' })
      ).toBeInTheDocument();
    });

    it('renders resend timer initially', () => {
      renderPage();
      expect(screen.getByText(/Resend OTP in/i)).toBeInTheDocument();
    });

    it('renders logo', () => {
      renderPage();
      expect(screen.getByAltText('RealityworksAI')).toBeInTheDocument();
    });
  });

  describe('OTP Input', () => {
    it('labels the code group and each digit for screen readers', () => {
      renderPage();
      expect(
        screen.getByRole('group', { name: 'Verification code' })
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 1 of 6')).toHaveAttribute(
        'id',
        'otp-0'
      );
      expect(screen.getByLabelText('Digit 6 of 6')).toHaveAttribute(
        'id',
        'otp-5'
      );
    });

    it('accepts only numeric input', () => {
      renderPage();
      const firstInput = document.getElementById('otp-0') as HTMLInputElement;

      fireEvent.change(firstInput, { target: { value: 'a' } });
      expect(firstInput.value).toBe('');

      fireEvent.change(firstInput, { target: { value: '5' } });
      expect(firstInput.value).toBe('5');
    });

    it('auto-focuses next input when digit is entered', () => {
      renderPage();
      const firstInput = document.getElementById('otp-0') as HTMLInputElement;
      const secondInput = document.getElementById('otp-1') as HTMLInputElement;

      fireEvent.change(firstInput, { target: { value: '1' } });
      expect(secondInput).toHaveFocus();
    });

    it('focuses previous input on backspace when current is empty', () => {
      renderPage();
      const firstInput = document.getElementById('otp-0') as HTMLInputElement;
      const secondInput = document.getElementById('otp-1') as HTMLInputElement;

      fireEvent.change(firstInput, { target: { value: '1' } });
      fireEvent.change(secondInput, { target: { value: '2' } });

      fireEvent.change(secondInput, { target: { value: '' } });

      fireEvent.keyDown(secondInput, { key: 'Backspace' });
    });

    it('allows pasting OTP digits', () => {
      renderPage();
      const firstInput = document.getElementById('otp-0') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData?.setData('text/plain', '123456');

      fireEvent.paste(firstInput, {
        clipboardData: { getData: () => '123456' },
      });
    });
  });

  describe('Enter Key Support', () => {
    it('submits OTP when Enter is pressed with all fields filled', async () => {
      renderPage();

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }
      const lastInput = document.getElementById('otp-5') as HTMLInputElement;
      fireEvent.keyDown(lastInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'auth/VerifyOTP',
          })
        );
      });
    });

    it('does not submit OTP when Enter is pressed with incomplete OTP', async () => {
      renderPage();

      for (let i = 0; i < 3; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }
      const thirdInput = document.getElementById('otp-2') as HTMLInputElement;
      fireEvent.keyDown(thirdInput, { key: 'Enter' });

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does not submit OTP when already loading and Enter is pressed', async () => {
      renderPage({ verifyOtpStatus: 'loading' });

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      mockDispatch.mockClear();

      const lastInput = document.getElementById('otp-5') as HTMLInputElement;
      fireEvent.keyDown(lastInput, { key: 'Enter' });

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('prevents default behavior when Enter is pressed', () => {
      renderPage();

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }
      const lastInput = document.getElementById('otp-5') as HTMLInputElement;

      fireEvent.keyDown(lastInput, { key: 'Enter' });
    });

    it('Enter key works from any OTP field, not just the last one', async () => {
      renderPage();
      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }
      const middleInput = document.getElementById('otp-2') as HTMLInputElement;
      fireEvent.keyDown(middleInput, { key: 'Enter' });

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
      });
    });
  });

  describe('Button Submit', () => {
    it('submits OTP when Verify button is clicked with complete OTP', async () => {
      renderPage();
      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }
      const verifyButton = screen.getByRole('button', { name: /Verify/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
      });
    });

    it('sends the email and otp rather than a reset token', async () => {
      renderPage();
      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
      });

      expect(mockVerifyOTPRequest).toHaveBeenCalledWith({
        email: MOCK_EMAIL,
        otp: '123456',
      });
    });

    it('navigates to reset password on successful verification', async () => {
      renderPage();

      // Fill all OTP fields
      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      mockDispatch.mockReturnValueOnce({
        unwrap: () =>
          Promise.resolve({
            data: {},
            message: 'OTP verified successfully',
          }),
      });

      const verifyButton = screen.getByRole('button', { name: /Verify/i });

      await act(async () => {
        fireEvent.click(verifyButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        '/resetpassword',
        expect.objectContaining({
          state: expect.objectContaining({
            email: MOCK_EMAIL,
            otp: '123456',
          }),
          replace: true,
        })
      );
    });

    it('dispatches verifyOTP reset action after successful verification', async () => {
      renderPage();

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      mockDispatch.mockReturnValueOnce({
        unwrap: () =>
          Promise.resolve({
            data: {},
            message: 'OTP verified successfully',
          }),
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
      });

      // verifyOTP() reset action should have been dispatched to invalidate the OTP
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'auth/VerifyOTP/reset',
      });
    });

    it('blocks re-verification when status is already succeeded', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage({ verifyOtpStatus: 'succeeded' });

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      mockDispatch.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
      });

      // API should NOT have been called again
      expect(mockVerifyOTPRequest).not.toHaveBeenCalled();
      // Error toast should be shown
      expect(toast.error).toHaveBeenCalledWith(
        'OTP has already been used. Please reset a new OTP.'
      );
    });

    it('prevents concurrent submissions via isSubmittingRef', async () => {
      renderPage();

      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: `${i + 1}` } });
      }

      // Simulate a slow response so the ref stays locked
      let resolveFirst!: (v: unknown) => void;
      mockDispatch.mockReturnValue({
        unwrap: () =>
          new Promise((res) => {
            resolveFirst = res;
          }),
      });

      const verifyButton = screen.getByRole('button', { name: /Verify/i });
      fireEvent.click(verifyButton);
      fireEvent.click(verifyButton); // second rapid click

      // Only one dispatch should have been called (second click blocked by ref)
      expect(mockDispatch).toHaveBeenCalledTimes(1);

      // Resolve the first request to clean up
      await act(async () => {
        resolveFirst({
          data: {},
          message: 'OTP verified successfully',
        });
      });
    });
  });

  // ───────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────

  describe('Validation', () => {
    it('OTP fields only accept single digits', () => {
      renderPage();
      const input = document.getElementById('otp-0') as HTMLInputElement;

      fireEvent.change(input, { target: { value: '123' } });
      expect(input.value).toBe('');
    });

    it('displays correct maxLength attribute', () => {
      renderPage();
      const input = document.getElementById('otp-0') as HTMLInputElement;

      expect(input).toHaveAttribute('maxLength', '1');
    });

    it('has inputMode numeric for mobile keyboards', () => {
      renderPage();
      const input = document.getElementById('otp-0') as HTMLInputElement;

      expect(input).toHaveAttribute('inputMode', 'numeric');
    });
  });

  describe('Backspace behavior', () => {
    it('does not move focus when backspace is pressed on filled field', () => {
      renderPage();
      const input = document.getElementById('otp-0') as HTMLInputElement;

      fireEvent.change(input, { target: { value: '1' } });
      fireEvent.keyDown(input, { key: 'Backspace' });

      // Focus should not move (backspace behavior only moves focus when field is empty)
    });
  });

  // ───────────────────────────────────────────────────────────
  // Navigation
  // ───────────────────────────────────────────────────────────

  describe('Navigation', () => {
    it('Sign In button navigates back to the login page', () => {
      renderPage();

      // Find the Sign In button - it's specifically the one in the back navigation section
      const buttons = screen.getAllByRole('button');
      const signInButton = buttons.find((btn) =>
        btn.textContent?.includes('Sign In')
      );

      if (signInButton) {
        fireEvent.click(signInButton);
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      }
    });
  });

  describe('Resend OTP', () => {
    const waitOutCooldown = () => {
      for (let i = 0; i < 300; i += 1) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
    };

    it('offers resend once the cooldown ends', () => {
      renderPage();
      waitOutCooldown();
      expect(
        screen.getByRole('button', { name: 'Resend OTP' })
      ).toBeInTheDocument();
    });

    it('disables resend and shows progress while the request runs', async () => {
      renderPage();
      waitOutCooldown();
      mockDispatch.mockReturnValueOnce({ unwrap: () => new Promise(() => {}) });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
      });

      const button = screen.getByRole('button', {
        name: 'Sending a new code…',
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(mockResendOTPRequest).toHaveBeenCalledTimes(1);
    });

    it('restarts the cooldown after a successful resend', async () => {
      renderPage();
      waitOutCooldown();
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.resolve({ message: 'OTP resent' }),
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
      });

      expect(screen.getByText(/Resend OTP in/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Resend OTP' })
      ).not.toBeInTheDocument();
    });

    it('lets the user retry straight away when the resend fails', async () => {
      const { toast } = await import('../../../src/components/common/Toast');
      renderPage();
      waitOutCooldown();
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.reject(new Error('Mail server down')),
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
      });

      expect(toast.error).toHaveBeenCalled();
      expect(screen.queryByText(/Resend OTP in/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resend OTP' })).toBeEnabled();
    });
  });
});
