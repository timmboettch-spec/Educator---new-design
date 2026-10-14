import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../src/test/testUtils';
import InviteSignUp from '../../../src/pages/auth/SignUp/InviteSignUp';
import { COMMON_VALIDATION } from '../../../src/utils/messages/common';

const INVITE_TOKEN = 'invite.token.value';
const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ invite_id: INVITE_TOKEN }),
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
}));

const mockDispatch = vi.fn();
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('../../../src/redux/auth/VerifyInviteRedux', () => ({
  default: () => ({}),
  VerifyInviteRequest: vi.fn((data) => ({
    type: 'auth/VerifyInvite',
    payload: data,
  })),
}));

vi.mock('../../../src/redux/auth/AcceptInviteRedux', () => ({
  default: () => ({}),
  AcceptInviteRequest: vi.fn((data) => ({
    type: 'auth/AcceptInvite',
    payload: data,
  })),
  logout: vi.fn(() => ({ type: 'auth/AcceptInvite/logout' })),
  selectAcceptInviteStatus: vi.fn(() => 'idle'),
  selectAcceptInviteError: vi.fn(() => null),
}));

vi.mock('../../../src/redux/api', () => ({
  refreshCsrfToken: vi.fn(),
}));

vi.mock('@/redux/auth/LoginRedux', async (importOriginal) => ({
  // The real reducer is still needed by the store renderWithProviders builds.
  ...(await importOriginal<typeof import('@/redux/auth/LoginRedux')>()),
  logout: vi.fn(() => ({ type: 'login/logout' })),
  restoreSession: vi.fn((payload) => ({
    type: 'login/restoreSession',
    payload,
  })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/storage', () => ({
  clearAuthData: vi.fn(),
  getToken: vi.fn(() => null),
  getStoredUser: vi.fn(() => null),
  setAuthData: vi.fn(),
  setSecondaryAuthData: vi.fn(),
}));

const verifiedInvite = {
  message: 'Success.',
  data: { email: 'invitee@example.com', full_name: 'Shyam' },
};

const renderVerified = async () => {
  mockDispatch.mockReturnValueOnce({
    unwrap: vi.fn().mockResolvedValue(verifiedInvite),
  });
  renderWithProviders(<InviteSignUp />);
  await waitFor(() =>
    expect(screen.getByPlaceholderText('Email *')).toHaveValue(
      'invitee@example.com'
    )
  );
};

const fillPasswords = (password: string, confirm: string) => {
  fireEvent.change(screen.getByPlaceholderText('Password'), {
    target: { name: 'password', value: password },
  });
  fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
    target: { name: 'confirmPassword', value: confirm },
  });
};

describe('InviteSignUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test('verifies the invite token and prefills name and email', async () => {
    const { VerifyInviteRequest } =
      await import('../../../src/redux/auth/VerifyInviteRedux');

    await renderVerified();

    expect(VerifyInviteRequest).toHaveBeenCalledWith({ token: INVITE_TOKEN });
    expect(screen.getByPlaceholderText('Full Name *')).toHaveValue('Shyam');
    expect(screen.getByPlaceholderText('Full Name *')).toBeDisabled();
    expect(screen.getByPlaceholderText('Email *')).toBeDisabled();
  });

  test('shows a loading state while the invite is being checked', () => {
    mockDispatch.mockReturnValueOnce({
      unwrap: vi.fn(() => new Promise(() => {})),
    });

    renderWithProviders(<InviteSignUp />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your invitation…'
    );
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  test('an invalid token shows the unavailable state instead of the form', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    mockDispatch.mockReturnValueOnce({
      unwrap: vi
        .fn()
        .mockRejectedValue({ message: 'Invalid or expired token' }),
    });

    renderWithProviders(<InviteSignUp />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This invitation can't be used"
    );
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Sign In' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('retrying an unavailable invite verifies it again', async () => {
    mockDispatch
      .mockReturnValueOnce({
        unwrap: vi.fn().mockRejectedValue({ message: 'Network Error' }),
      })
      .mockReturnValueOnce({
        unwrap: vi.fn().mockResolvedValue(verifiedInvite),
      });

    renderWithProviders(<InviteSignUp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Email *')).toHaveValue(
        'invitee@example.com'
      )
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('requires both password fields', async () => {
    const { AcceptInviteRequest } =
      await import('../../../src/redux/auth/AcceptInviteRedux');
    await renderVerified();

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(
      await screen.findByText(COMMON_VALIDATION.REQUIRED)
    ).toBeInTheDocument();
    expect(AcceptInviteRequest).not.toHaveBeenCalled();
  });

  test('rejects mismatched passwords', async () => {
    const { AcceptInviteRequest } =
      await import('../../../src/redux/auth/AcceptInviteRedux');
    await renderVerified();

    fillPasswords('Password@123', 'Password@124');
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(
      await screen.findByText('Passwords do not match')
    ).toBeInTheDocument();
    expect(AcceptInviteRequest).not.toHaveBeenCalled();
  });

  const acceptInvite = async (response: unknown) => {
    await renderVerified();
    mockDispatch.mockReturnValueOnce({
      unwrap: vi.fn().mockResolvedValue(response),
    });
    fillPasswords('Password@123', 'Password@123');
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
  };

  test('accepting the invite sends the user to sign in', async () => {
    const { AcceptInviteRequest } =
      await import('../../../src/redux/auth/AcceptInviteRedux');
    const { setAuthData, clearAuthData } = await import('@/utils/storage');
    const { toast } = await import('../../../src/components/common/Toast');

    // accept-invite only activates the account: no tokens, no session.
    await acceptInvite({ message: 'Invite accepted.', data: {} });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    );
    expect(AcceptInviteRequest).toHaveBeenCalledWith({
      token: INVITE_TOKEN,
      password: 'Password@123',
    });
    expect(toast.success).toHaveBeenCalledWith('Invite accepted.');
    expect(clearAuthData).toHaveBeenCalled();
    expect(setAuthData).not.toHaveBeenCalled();
  });

  test('shows the API error when accepting fails', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    await renderVerified();

    mockDispatch.mockReturnValueOnce({
      unwrap: vi.fn().mockRejectedValue({ message: 'Invite already used' }),
    });
    fillPasswords('Password@123', 'Password@123');
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Invite already used')
    );
  });

  test('a failed sign-up shows the backend message inline', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    await renderVerified();
    mockDispatch.mockReturnValueOnce({
      unwrap: vi.fn().mockRejectedValue({ message: 'Invite already used' }),
    });

    fillPasswords('Valid@123', 'Valid@123');
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invite already used'
    );
    expect(toast.error).toHaveBeenCalledWith('Invite already used');
  });

  test('a failed sign-up without a message falls back to translated copy', async () => {
    await renderVerified();
    mockDispatch.mockReturnValueOnce({
      unwrap: vi.fn().mockRejectedValue({}),
    });

    fillPasswords('Valid@123', 'Valid@123');
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't set up your account. Please try again."
    );
  });
});
