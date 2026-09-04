import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../../src/components/layout/Header';

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );

vi.mock('../../../public/assets/dashboard/logout_svg.svg', () => ({
  default: 'logout-icon',
}));

vi.mock('../../../public/assets/dashboard/notification_svg.svg', () => ({
  default: 'notify-icon',
}));

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  logout: vi.fn(() => ({ type: 'login/logout' })),
  selectLoginResponse: vi.fn(() => null),
  restoreSession: vi.fn(() => ({ type: 'login/restoreSession' })),
}));

vi.mock('../../../src/redux/auth/SignUpRedux', () => ({
  logout: vi.fn(() => ({ type: 'signup/logout' })),
  selectSignUpResponse: vi.fn(() => null),
}));

vi.mock('../../../src/redux/auth/LogoutRedux', () => ({
  LogoutRequest: vi.fn(() => ({ type: 'auth/logout' })),
  resetLogout: vi.fn(() => ({ type: 'auth/logout/reset' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => null),
  getToken: vi.fn(() => null),
  getCsrfToken: vi.fn(() => null),
  clearAuthData: vi.fn(() => {
    localStorage.clear();
  }),
  getSecondaryToken: vi.fn(() => null),
  getSecondaryUser: vi.fn(() => null),
  swapRoles: vi.fn(() => false),
}));

vi.mock('../../../src/components/modal/ConfirmationModal', () => ({
  default: ({
    isOpen,
    title,
    onConfirm,
    onCancel,
    cancelText,
    confirmText,
  }: {
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    cancelText: string;
    confirmText: string;
  }) =>
    isOpen ? (
      <div>
        <p>{title}</p>
        <button onClick={onCancel}>{cancelText}</button>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/utils/messages/auth', () => ({
  AUTH_MESSAGES: {
    TOAST: {
      LOGOUT_SUCCESS: 'Logged out successfully',
      LOGOUT_FAILED: 'Logout failed',
    },
  },
}));

const mockDispatch = vi.fn();
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn((selector) =>
    selector({
      Notifications: {
        notifications: [],
        unreadCount: 0,
      },
    }),
  ),
}));

const clickLogoutTrigger = () => {
  const btns = screen.getAllByAltText(/logout/i);
  fireEvent.click(btns[btns.length - 1]);
};

describe('Header Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('renders notification icon', () => {
    renderHeader();
    expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
  });

  test('renders logout icon', () => {
    renderHeader();
    expect(screen.getAllByAltText(/logout/i).length).toBeGreaterThan(0);
  });

  test('shows U when no user', () => {
    renderHeader();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  test('shows first letter from localStorage full_name', async () => {
    const { getParsedUser } = await import('../../../src/utils/storage');
    vi.mocked(getParsedUser).mockReturnValue({ full_name: 'Ravi' });
    renderHeader();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  test('opens modal on logout click', () => {
    renderHeader();
    clickLogoutTrigger();
    expect(screen.getByText(/do you want to sign out\?/i)).toBeInTheDocument();
  });

  test('closes modal on No click', () => {
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/^no$/i));
    expect(screen.queryByText(/do you want to sign out\?/i)).not.toBeInTheDocument();
  });

  test('calls dispatch on Yes click', async () => {
    mockDispatch.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/yes, sign out/i));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  });

  test('clears localStorage after logout', async () => {
    mockDispatch.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    localStorage.setItem('token', 'abc');
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/yes, sign out/i));
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull(), { timeout: 5000 });
  });

  test('calls success toast on logout', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    mockDispatch.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/yes, sign out/i));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  test('calls error toast on logout failure', async () => {
    const { toast } = await import('../../../src/components/common/Toast');
    mockDispatch.mockReturnValue({ unwrap: vi.fn().mockRejectedValue(new Error('fail')) });
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/yes, sign out/i));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
