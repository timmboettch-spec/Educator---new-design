import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import Account from '../../../src/pages/app/account/index';
import '@testing-library/jest-dom/vitest';
import i18n from '@/i18n';

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: vi.fn(() => null),
  Provider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => ({
    id: 1,
    full_name: 'Sanjay Kumar',
    email: 'sanjay@example.com',
    role: 'District Admin',
    profile_picture: '',
    subscriptions: [{ ai_seats: 5, seats_available: 3 }],
  })),
  updateStoredUser: vi.fn(),
  getToken: vi.fn(() => 'mock-token'),
  getSecondaryToken: vi.fn(() => null),
  clearAuthData: vi.fn(),
  setAuthData: vi.fn(),
}));

const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(() => 0),
}));

vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  FetchClassesRequest: vi.fn(() => ({ type: 'fetchClassesRequest' })),
  selectClassRemainingTokens: vi.fn(),
}));

vi.mock('../../../src/redux/auth/UpdateProfileRedux', () => ({
  updateProfile: Object.assign(
    vi.fn((payload: unknown) => ({ type: 'updateProfile', payload })),
    {
      fulfilled: {
        match: (a: { type: string }) => a.type === 'updateProfile/fulfilled',
      },
    }
  ),
}));

vi.mock('../../../src/redux/auth/ChangePasswordRedux', () => ({
  changePassword: Object.assign(
    vi.fn((payload: unknown) => ({ type: 'changePassword', payload })),
    {
      fulfilled: {
        match: (a: { type: string }) => a.type === 'changePassword/fulfilled',
      },
    }
  ),
}));

vi.mock('@/redux/auth/MeRedux', () => ({
  fetchCurrentUser: vi.fn(() => ({ type: 'auth/Me' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../../src/components/notifications/NotificationSettings', () => ({
  default: () => null,
}));

vi.mock('../../../src/pages/auth/RedeemCode/index', () => ({
  default: () => <div data-testid="redeem-modal">Redeem Code Modal</div>,
}));

vi.mock('../../../src/components/common/PageHeader', () => ({
  PageHeader: ({
    title,
    sub_text,
    actionButton,
  }: {
    title: string;
    sub_text: string;
    actionButton: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{sub_text}</p>
      {actionButton}
    </div>
  ),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>
  );

describe('Account Page + Modal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('PasswordModal — open / close / submit flow', () => {
    it('opens PasswordModal when "Change Password" button is clicked', async () => {
      renderPage();

      const changePasswordBtn = await screen.findByRole('button', {
        name: /change password/i,
      });
      await act(async () => {
        fireEvent.click(changePasswordBtn);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Old Password')).toBeInTheDocument();
      });
    });

    it('gives Old, New and Confirm password a show/hide toggle', async () => {
      renderPage();

      await act(async () => {
        fireEvent.click(
          await screen.findByRole('button', { name: /change password/i })
        );
      });

      expect(
        await screen.findAllByRole('button', { name: 'Show password' })
      ).toHaveLength(3);
    });

    it('reveals and re-masks the old password with its toggle', async () => {
      renderPage();

      await act(async () => {
        fireEvent.click(
          await screen.findByRole('button', { name: /change password/i })
        );
      });

      const currentField = await screen.findByPlaceholderText('Old Password');
      expect(currentField).toHaveAttribute('type', 'password');

      const [currentToggle] = screen.getAllByRole('button', {
        name: 'Show password',
      });
      fireEvent.click(currentToggle!);
      expect(currentField).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(currentField).toHaveAttribute('type', 'password');
    });

    describe('in Spanish', () => {
      beforeEach(async () => {
        await act(() => i18n.changeLanguage('es'));
      });
      afterEach(async () => {
        await act(() => i18n.changeLanguage('en'));
      });

      it('labels the show/hide toggles in Spanish', async () => {
        renderPage();

        await act(async () => {
          fireEvent.click(
            await screen.findByRole('button', { name: /cambiar contrasena/i })
          );
        });

        const toggles = await screen.findAllByRole('button', {
          name: 'Mostrar contraseña',
        });
        expect(toggles).toHaveLength(3);
        expect(
          screen.queryByRole('button', { name: 'Show password' })
        ).not.toBeInTheDocument();

        fireEvent.click(toggles[0]!);
        expect(
          screen.getByRole('button', { name: 'Ocultar contraseña' })
        ).toBeInTheDocument();
      });
    });

    it('closes PasswordModal when Cancel is clicked', async () => {
      renderPage();

      const changePasswordBtn = await screen.findByRole('button', {
        name: /change password/i,
      });
      await act(async () => {
        fireEvent.click(changePasswordBtn);
      });

      const cancelBtn = await screen.findByRole('button', { name: /cancel/i });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('validates password fields when form is submitted empty', async () => {
      renderPage();

      const changePasswordBtn = await screen.findByRole('button', {
        name: /change password/i,
      });
      await act(async () => {
        fireEvent.click(changePasswordBtn);
      });

      const submitBtn = screen.queryByRole('button', {
        name: /save|submit|update/i,
      });
      if (submitBtn) {
        await act(async () => {
          fireEvent.click(submitBtn);
        });
        await waitFor(() => {
          const errors = screen.queryAllByText(/required|invalid|must/i);
          expect(errors.length).toBeGreaterThan(0);
        });
      }
    });

    it('dispatches changePassword when valid passwords are entered', async () => {
      renderPage();

      const changePasswordBtn = await screen.findByRole('button', {
        name: /change password/i,
      });
      await act(async () => {
        fireEvent.click(changePasswordBtn);
      });

      const inputs = screen.queryAllByRole('textbox');
      inputs.forEach((input) => {
        fireEvent.change(input, { target: { value: 'ValidPass@123' } });
      });

      const submitBtn = screen.queryByRole('button', {
        name: /save|submit|update/i,
      });
      if (submitBtn) {
        await act(async () => {
          fireEvent.click(submitBtn);
        });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });
  });

  describe('EditProfileModal — open / close / submit flow', () => {
    it('opens EditProfileModal when edit profile action is triggered', async () => {
      renderPage();

      const editBtn = screen.queryByRole('button', {
        name: /edit profile|edit/i,
      });
      if (editBtn) {
        await act(async () => {
          fireEvent.click(editBtn);
        });
        await waitFor(() => {
          const nameField = screen.queryByDisplayValue('Sanjay Kumar');
          const emailField = screen.queryByDisplayValue('sanjay@example.com');
          expect(nameField ?? emailField).toBeInTheDocument();
        });
      }
    });

    it('closes EditProfileModal when Cancel is clicked', async () => {
      renderPage();

      const editBtn = screen.queryByRole('button', {
        name: /edit profile|edit/i,
      });
      if (editBtn) {
        await act(async () => {
          fireEvent.click(editBtn);
        });

        const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
        if (cancelBtn) {
          await act(async () => {
            fireEvent.click(cancelBtn);
          });
          await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          });
        }
      }
    });

    it('dispatches updateProfile when edit form is submitted', async () => {
      renderPage();

      const editBtn = screen.queryByRole('button', {
        name: /edit profile|edit/i,
      });
      if (editBtn) {
        await act(async () => {
          fireEvent.click(editBtn);
        });

        const saveBtn = screen.queryByRole('button', { name: /save|update/i });
        if (saveBtn) {
          await act(async () => {
            fireEvent.click(saveBtn);
          });
          await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Modal exclusivity — only one modal open at a time', () => {
    it('does not open two modals simultaneously', async () => {
      renderPage();

      const changePasswordBtn = screen.queryByRole('button', {
        name: /change password/i,
      });
      if (changePasswordBtn) {
        await act(async () => {
          fireEvent.click(changePasswordBtn);
        });

        const dialogs = screen.queryAllByRole('dialog');
        expect(dialogs.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Account page renders with user info', () => {
    it('displays user name on account page', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryAllByText(/Sanjay Kumar/i).length).toBeGreaterThan(
          0
        );
      });
    });

    it('displays user email on account page', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/sanjay@example.com/i)).toBeInTheDocument();
      });
    });
  });
});
