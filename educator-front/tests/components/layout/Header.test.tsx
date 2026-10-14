import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../src/i18n';
import Header from '../../../src/components/layout/Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../src/redux/auth/SelectRoleRedux', () => ({
  SelectRoleRequest: vi.fn(() => ({ type: 'auth/SelectRole' })),
}));

vi.mock('../../../src/redux/api', () => ({
  refreshCsrfToken: vi.fn(),
}));

vi.mock('../../../src/utils/forceLogout', () => ({
  forceLogout: vi.fn(),
  LOGOUT_MESSAGES: { SESSION_EXPIRED: 'Session expired message' },
}));

vi.mock('../../../src/components/layout/NotificationPanel', () => ({
  default: () => (
    <button aria-label="Notifications" data-testid="notification-panel" />
  ),
}));

const renderHeader = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </I18nextProvider>
  );

const mockIdentity: { role: 'district_admin' | 'educator' | null } = {
  role: null,
};
vi.mock('../../../src/features/auth/model/useSessionIdentity', () => ({
  useSessionIdentity: () => mockIdentity,
}));

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
  isRememberMe: vi.fn(() => true),
  setAuthData: vi.fn(),
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
      SWITCHED_TO_ADMIN: 'Switched to Administrator',
      SWITCHED_TO_EDUCATOR: 'Switched to Educator',
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
    })
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
    mockIdentity.role = null;
  });

  test('shows Administrator Portal for a district admin', () => {
    mockIdentity.role = 'district_admin';
    renderHeader();
    expect(screen.getByText('Administrator Portal')).toBeInTheDocument();
  });

  test('shows Educator Portal for an educator', () => {
    mockIdentity.role = 'educator';
    renderHeader();
    expect(screen.getByText('Educator Portal')).toBeInTheDocument();
  });

  test('shows no portal title before the role resolves', () => {
    renderHeader();
    expect(screen.queryByText(/portal/i)).not.toBeInTheDocument();
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

  test('falls back to the initial when the profile picture fails to load', async () => {
    const { getParsedUser } = await import('../../../src/utils/storage');
    vi.mocked(getParsedUser).mockReturnValue({
      full_name: 'Ravi',
      profile_picture: 'https://cdn.example.com/broken.png',
    });
    renderHeader();

    const avatar = screen.getByAltText('Ravi');
    fireEvent.error(avatar);
    expect(screen.queryByAltText('Ravi')).not.toBeInTheDocument();
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
    expect(
      screen.queryByText(/do you want to sign out\?/i)
    ).not.toBeInTheDocument();
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
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull(), {
      timeout: 5000,
    });
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
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('fail')),
    });
    renderHeader();
    clickLogoutTrigger();
    fireEvent.click(screen.getByText(/yes, sign out/i));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  describe('role switch', () => {
    const adminRole = {
      id: 'role-admin',
      name: 'District Admin',
      slug: 'district_admin',
    };
    const educatorRole = {
      id: 'role-educator',
      name: 'Educator',
      slug: 'educator',
    };
    const storedEducator = {
      full_name: 'Kay',
      role: 'Educator',
      available_roles: [adminRole, educatorRole],
      active_role_id: educatorRole.id,
    };

    test('hidden for a single-role account', async () => {
      const { getParsedUser } = await import('../../../src/utils/storage');
      vi.mocked(getParsedUser).mockReturnValue({
        full_name: 'Kay',
        available_roles: [educatorRole],
        active_role_id: educatorRole.id,
      });
      renderHeader();
      expect(
        screen.queryByRole('button', { name: /switch to/i })
      ).not.toBeInTheDocument();
    });

    test('offers the other role for a multi-role account', async () => {
      const { getParsedUser } = await import('../../../src/utils/storage');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      renderHeader();
      expect(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      ).toBeInTheDocument();
    });

    test('switches through select-role and lands on the new dashboard', async () => {
      const { getParsedUser, setAuthData } =
        await import('../../../src/utils/storage');
      const { SelectRoleRequest } =
        await import('../../../src/redux/auth/SelectRoleRedux');
      const { toast } = await import('../../../src/components/common/Toast');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      mockDispatch.mockReturnValue({
        unwrap: vi.fn().mockResolvedValue({
          message: 'Role selected.',
          data: {
            accessStatus: 'access_granted',
            tokens: { accessToken: 'admin-token', csrfToken: 'admin-csrf' },
            activeRole: {
              ...adminRole,
              districtAdmin: { fullName: 'Kay', isLicenseActive: true },
            },
            user: { userId: 'user-1', userRoles: [adminRole, educatorRole] },
          },
        }),
      });

      renderHeader();
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      );

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/admin-dashboard')
      );
      expect(SelectRoleRequest).toHaveBeenCalledWith({ roleId: adminRole.id });
      expect(setAuthData).toHaveBeenCalledWith(
        { accessToken: 'admin-token', csrfToken: 'admin-csrf' },
        expect.objectContaining({
          role: 'District Admin',
          active_role_id: adminRole.id,
        }),
        true
      );
      expect(toast.success).toHaveBeenCalledWith('Switched to Administrator');
    });

    test('without activeRole the requested role is used', async () => {
      const { getParsedUser, setAuthData } =
        await import('../../../src/utils/storage');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      mockDispatch.mockReturnValue({
        unwrap: vi.fn().mockResolvedValue({
          message: 'Role selected.',
          data: {
            accessStatus: 'access_granted',
            tokens: { accessToken: 'admin-token', csrfToken: 'admin-csrf' },
            // Educator listed first, so userRoles[0] would be the wrong role.
            user: {
              userId: 'user-1',
              userRoles: [
                educatorRole,
                {
                  ...adminRole,
                  districtAdmin: { fullName: 'Kay', isLicenseActive: true },
                },
              ],
            },
          },
        }),
      });

      renderHeader();
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      );

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/admin-dashboard')
      );
      expect(setAuthData).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'District Admin' }),
        true
      );
    });

    test('a 401 sends the user back through login', async () => {
      const { getParsedUser } = await import('../../../src/utils/storage');
      const { forceLogout } = await import('../../../src/utils/forceLogout');
      const { toast } = await import('../../../src/components/common/Toast');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      mockDispatch.mockReturnValue({
        unwrap: vi.fn().mockRejectedValue({
          message: 'The selected role is no longer available for this account.',
          status: 401,
        }),
      });

      renderHeader();
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      );

      await waitFor(() =>
        expect(forceLogout).toHaveBeenCalledWith('Session expired message')
      );
      expect(toast.error).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('a 403 shows an error and keeps the session', async () => {
      const { getParsedUser } = await import('../../../src/utils/storage');
      const { forceLogout } = await import('../../../src/utils/forceLogout');
      const { toast } = await import('../../../src/components/common/Toast');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      mockDispatch.mockReturnValue({
        unwrap: vi
          .fn()
          .mockRejectedValue({ message: 'Forbidden', status: 403 }),
      });

      renderHeader();
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Forbidden')
      );
      expect(forceLogout).not.toHaveBeenCalled();
    });

    test('shows the API message when the switch fails', async () => {
      const { getParsedUser, setAuthData } =
        await import('../../../src/utils/storage');
      const { toast } = await import('../../../src/components/common/Toast');
      vi.mocked(getParsedUser).mockReturnValue(storedEducator);
      mockDispatch.mockReturnValue({
        unwrap: vi.fn().mockRejectedValue({ message: 'Something broke' }),
      });

      renderHeader();
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to Administrator' })
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Something broke')
      );
      expect(setAuthData).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
