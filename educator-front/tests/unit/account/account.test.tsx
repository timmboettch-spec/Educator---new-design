import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import i18n from '@/i18n';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Account from '../../../src/pages/app/account/index';

const mockDispatch = vi.fn();

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => ({
    id: 1,
    full_name: 'Sanjay',
    email: 'test@gmail.com',
    role: 'District Admin',
    profile_picture: '',
    subscriptions: [{ ai_seats: 0, seats_available: 0 }],
  })),
  updateStoredUser: vi.fn(),
  getToken: vi.fn(() => null),
  getSecondaryToken: vi.fn(() => null),
  clearAuthData: vi.fn(),
  setAuthData: vi.fn(),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(() => 0),
}));

vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  default: (state = {}) => state,
  FetchClassesRequest: vi.fn(() => ({
    type: 'fetchClassesRequest',
  })),
  selectClassRemainingTokens: vi.fn(),
}));

interface PageHeaderProps {
  title: string;
  sub_text: string;
  actionButton: React.ReactNode;
}

vi.mock('../../../src/components/common/PageHeader', () => ({
  PageHeader: ({ title, sub_text, actionButton }: PageHeaderProps) => (
    <div>
      <h1>{title}</h1>
      <p>{sub_text}</p>
      {actionButton}
    </div>
  ),
}));

interface LoaderProps {
  loading: boolean;
}

vi.mock('../../../src/components/common/Loader', () => ({
  default: ({ loading }: LoaderProps) =>
    loading ? <div>Loading...</div> : null,
}));

vi.mock('../../../src/pages/auth/RedeemCode/index', () => ({
  default: ({
    onSubmitSubscribe,
  }: {
    onSubmitSubscribe?: (code: string) => Promise<void>;
  }) => (
    <div>
      Redeem Code Modal
      <button
        onClick={() =>
          onSubmitSubscribe?.('RWMASTER20250617').catch(() => {
            /* mirrors RedeemCode's own local catch */
          })
        }
      >
        Submit Redeem Code
      </button>
    </div>
  ),
}));

vi.mock('../../../src/redux/auth/RedeemRedux', () => ({
  RedeemRequest: vi.fn((payload: unknown) => ({
    type: 'auth/redeem',
    payload,
  })),
  clearRedeemError: vi.fn(() => ({ type: 'auth/redeem/clearError' })),
  selectRedeemError: vi.fn(() => null),
}));

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  [key: string]: unknown;
}

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({ children, onClick, ...props }: ButtonProps) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

interface InputProps {
  label?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  error?: string;
}

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    label,
    value,
    onChange,
    onBlur,
    disabled,
    type = 'text',
    placeholder,
    error,
  }: InputProps) => (
    <div>
      {label ? <label>{label}</label> : null}
      <input
        aria-label={label || placeholder || 'input'}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
      />
      {error && <p>{error}</p>}
    </div>
  ),
}));

interface ReduxAction {
  type: string;
  payload?: unknown;
}

vi.mock('../../../src/redux/auth/UpdateProfileRedux', () => {
  const fulfilled = {
    match: (action: ReduxAction) => action.type === 'profile/update/fulfilled',
  };

  return {
    updateProfileRequest: Object.assign(
      vi.fn((payload: unknown) => ({
        type: 'profile/update',
        payload,
      })),
      { fulfilled }
    ),
  };
});

vi.mock('../../../src/redux/auth/ChangePasswordRedux', () => {
  const fulfilled = {
    match: (action: ReduxAction) =>
      action.type === 'changePassword/changePassword/fulfilled',
  };

  return {
    changePasswordRequest: Object.assign(
      vi.fn((payload: unknown) => ({
        type: 'changePassword/changePassword',
        payload,
      })),
      { fulfilled }
    ),
  };
});

vi.mock('@/redux/auth/MeRedux', () => ({
  default: (state = {}) => state,
  fetchCurrentUser: vi.fn(() => ({ type: 'auth/Me' })),
}));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../../src/components/notifications/NotificationSettings', () => ({
  default: () => null,
}));

vi.mock('@/components/modal/RequestSeatsModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="request-seats-modal">
        <button onClick={onClose}>Close Request Seats</button>
      </div>
    ) : null,
}));

import { toast } from '../../../src/components/common/Toast';
import { ACCOUNT_VALIDATION } from '../../../src/utils/messages/account';
import { updateProfileRequest } from '../../../src/redux/auth/UpdateProfileRedux';
import { changePasswordRequest } from '../../../src/redux/auth/ChangePasswordRedux';
import { getParsedUser } from '../../../src/utils/storage';
describe('Account Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    localStorage.clear();

    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 1,
        full_name: 'Sanjay',
        email: 'test@gmail.com',
        role: 'District Admin',
        profile_picture: '',
        subscriptions: [
          {
            ai_seats: 0,
            seats_available: 0,
          },
        ],
      })
    );

    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return Promise.resolve({
          type: 'profile/update/fulfilled',
          payload: {
            data: {
              full_name: 'Sanjay',
              profile_picture: 'https://cdn.example.com/profile.png',
            },
          },
        });
      }

      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }

      return Promise.resolve({
        type: 'default',
      });
    });
  });

  const renderComponent = () => render(<Account />, { wrapper: MemoryRouter });

  describe('opening at the notification preferences', () => {
    const scrolledIds = () =>
      vi
        .mocked(Element.prototype.scrollIntoView)
        .mock.contexts.map((el) => (el as Element).id);

    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    test('scrolls to them when the dashboard asks to', async () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/account',
              state: { scrollTo: 'notification-preferences' },
            },
          ]}
        >
          <Account />
        </MemoryRouter>
      );

      await waitFor(() =>
        expect(scrolledIds()).toContain('notification-preferences')
      );
    });

    test('stays at the top otherwise', async () => {
      renderComponent();
      await screen.findByText('Account Settings');
      // Let the animation frame the scroll would use run.
      await act(
        () =>
          new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      );

      expect(scrolledIds()).not.toContain('notification-preferences');
    });
  });

  test('renders profile information correctly', async () => {
    renderComponent();

    expect(await screen.findByText('Account Settings')).toBeInTheDocument();

    expect(screen.getAllByText('Sanjay').length).toBeGreaterThan(0);

    expect(screen.getByText('test@gmail.com')).toBeInTheDocument();
  });

  test('shows Edit Profile beside the name in the profile row', async () => {
    renderComponent();

    const profileRow = await screen.findByTestId('profile-photo-dropzone');
    expect(
      within(profileRow).getByRole('button', { name: 'Edit Profile' })
    ).toBeInTheDocument();
    expect(within(profileRow).getByText('Add Photo')).toBeInTheDocument();
  });

  test('shows the initial as the avatar when there is no photo', async () => {
    renderComponent();

    const profileRow = await screen.findByTestId('profile-photo-dropzone');
    expect(within(profileRow).getByText('S')).toBeInTheDocument();
    expect(within(profileRow).queryByRole('img')).not.toBeInTheDocument();
  });

  test('labels the read-only Full Name and Email fields', async () => {
    renderComponent();

    await screen.findByText('test@gmail.com');
    const terms = screen.getAllByRole('term');
    const values = screen.getAllByRole('definition');
    expect(terms.map((term) => term.textContent)).toEqual([
      'Full Name',
      'Email',
    ]);
    expect(values[0]).toHaveTextContent('Sanjay');
    expect(values[1]).toHaveTextContent('test@gmail.com');
  });

  test('email field is disabled', async () => {
    renderComponent();

    // Email is displayed as read-only text (not an editable input)
    const emailEl = await screen.findByText('test@gmail.com');
    expect(emailEl).toBeInTheDocument();
  });

  test('keeps Save disabled until the name actually changes', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Edit Profile'));
    const saveButton = await screen.findByText('Save Changes');
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByPlaceholderText('Enter Full Name');
    fireEvent.change(nameInput, { target: { value: 'Sanjay K' } });
    expect(saveButton).toBeEnabled();

    // Back to the saved name: nothing to save again.
    fireEvent.change(nameInput, { target: { value: 'Sanjay' } });
    expect(saveButton).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('updates name successfully', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return Promise.resolve({
          type: 'profile/update/fulfilled',
          payload: {
            message: 'Profile updated successfully',
            data: {
              full_name: 'Updated User',
              profile_picture: '',
            },
          },
        });
      }

      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }

      return Promise.resolve({
        type: 'default',
      });
    });

    renderComponent();

    // Open the edit profile modal
    fireEvent.click(await screen.findByText('Edit Profile'));

    // Find the name input inside the modal
    const nameInput = await screen.findByPlaceholderText('Enter Full Name');

    fireEvent.change(nameInput, {
      target: {
        value: 'Updated User',
      },
    });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(
      screen.queryByPlaceholderText('Enter Full Name')
    ).not.toBeInTheDocument();
  });

  test('shows Saving… on the button instead of the full-page loader while the name saves', async () => {
    await i18n.changeLanguage('en');
    let finishSave: (value: unknown) => void = () => {};
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return new Promise((resolve) => {
          finishSave = resolve;
        });
      }
      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }
      return Promise.resolve({ type: 'default' });
    });

    renderComponent();
    fireEvent.click(await screen.findByText('Edit Profile'));
    fireEvent.change(await screen.findByPlaceholderText('Enter Full Name'), {
      target: { value: 'Updated User' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    const savingButton = await screen.findByText('Saving…');
    expect(savingButton).toBeDisabled();
    // Can't be closed mid-save, so a second save can't start.
    expect(screen.getByText('Cancel')).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByPlaceholderText('Enter Full Name')).toBeInTheDocument();
    expect(updateProfileRequest).toHaveBeenCalledWith({
      fullName: 'Updated User',
      silent: true,
    });

    await act(async () => {
      finishSave({ type: 'profile/update/fulfilled', payload: {} });
    });
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Enter Full Name')
      ).not.toBeInTheDocument();
    });
  });

  test('keeps Edit Profile open with the message when the save fails', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return Promise.resolve({
          type: 'profile/update/rejected',
          payload: 'Full name is too long',
        });
      }
      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }
      return Promise.resolve({ type: 'default' });
    });

    renderComponent();
    fireEvent.click(await screen.findByText('Edit Profile'));
    const nameInput = await screen.findByPlaceholderText('Enter Full Name');
    fireEvent.change(nameInput, { target: { value: 'Updated User' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(
      await screen.findByText('Full name is too long')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Full Name')).toHaveValue(
      'Updated User'
    );
    expect(toast.success).not.toHaveBeenCalled();
    // The card still shows the saved name, not the one that failed.
    expect(screen.queryByText('Updated User')).not.toBeInTheDocument();
  });

  test('shows a generic message in Edit Profile when the save errors without one', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return Promise.resolve({ type: 'profile/update/rejected' });
      }
      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }
      return Promise.resolve({ type: 'default' });
    });

    renderComponent();
    fireEvent.click(await screen.findByText('Edit Profile'));
    fireEvent.change(await screen.findByPlaceholderText('Enter Full Name'), {
      target: { value: 'Updated User' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(
      await screen.findByText(ACCOUNT_VALIDATION.UPDATE_FAILED)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Full Name')).toBeInTheDocument();
  });

  test('updates profile image successfully', async () => {
    renderComponent();

    const file = new File(['dummy'], 'profile.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [file],
        },
      });
    });

    expect(input.files?.[0]).toEqual(file);
    await waitFor(() => {
      expect(updateProfileRequest).toHaveBeenCalled();
    });
  });

  test('file input accepts jpg jpeg png svg', async () => {
    renderComponent();

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input).toHaveAttribute(
      'accept',
      '.jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml'
    );
  });

  test.each([
    ['avatar.jpg', 'image/jpeg'],
    ['avatar.jpeg', 'image/jpeg'],
    ['avatar.png', 'image/png'],
    ['avatar.svg', 'image/svg+xml'],
  ])('allows supported image format %s', async (fileName, mimeType) => {
    renderComponent();

    const file = new File(['dummy'], fileName, { type: mimeType });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [file],
        },
      });
    });

    await waitFor(() => {
      expect(updateProfileRequest).toHaveBeenCalled();
    });
  });

  test.each([
    ['resume.pdf', 'application/pdf'],
    ['resume.doc', 'application/msword'],
    [
      'resume.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['script.exe', 'application/x-msdownload'],
    ['image-as-pdf.png', 'application/pdf'],
  ])(
    'rejects unsupported format %s and prevents upload',
    async (fileName, mimeType) => {
      renderComponent();

      const file = new File(['dummy'], fileName, { type: mimeType });
      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      await act(async () => {
        fireEvent.change(input, {
          target: {
            files: [file],
          },
        });
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID
        );
      });

      const updateProfileCalls = (
        updateProfileRequest as unknown as { mock: { calls: unknown[] } }
      ).mock.calls.length;
      expect(updateProfileCalls).toBe(0);
    }
  );

  test('applies same validation rules for drag-and-drop upload', async () => {
    renderComponent();

    const dropzone = await screen.findByTestId('profile-photo-dropzone');
    const invalidFile = new File(['dummy'], 'not-image.pdf', {
      type: 'application/pdf',
    });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID
      );
    });

    const updateProfileCalls = (
      updateProfileRequest as unknown as { mock: { calls: unknown[] } }
    ).mock.calls.length;
    expect(updateProfileCalls).toBe(0);
  });

  test('rejects image larger than 5MB', async () => {
    renderComponent();

    const bigFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [bigFile],
        },
      });
    });

    expect(toast.error).toHaveBeenCalledWith(
      ACCOUNT_VALIDATION.IMAGE_TOO_LARGE
    );
  });

  test('opens change password modal', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    expect(await screen.findByText('Update Password')).toBeInTheDocument();
  });

  test('validates empty password fields', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    fireEvent.click(await screen.findByText('Update Password'));

    await waitFor(() => {
      expect(
        screen.getByText(ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED)
      ).toBeInTheDocument();

      expect(
        screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED)
      ).toBeInTheDocument();

      expect(
        screen.getByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED)
      ).toBeInTheDocument();
    });
  });

  test('shows password mismatch error', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    const oldPasswordInput = screen.getByPlaceholderText('Old Password');

    const newPasswordInput = screen.getByPlaceholderText('New Password');

    const confirmPasswordInput =
      screen.getByPlaceholderText('Confirm Password');

    fireEvent.change(oldPasswordInput, {
      target: {
        value: 'OldP@ss1',
      },
    });

    fireEvent.change(newPasswordInput, {
      target: {
        value: 'NewP@ss1!',
      },
    });

    fireEvent.change(confirmPasswordInput, {
      target: {
        value: 'DiffP@ss2!',
      },
    });

    fireEvent.click(screen.getByText('Update Password'));

    await waitFor(() => {
      expect(
        screen.getByText(ACCOUNT_VALIDATION.PASSWORD_MISMATCH)
      ).toBeInTheDocument();
    });
  });

  test('dispatches incorrect old password action', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'changePassword/changePassword') {
        return {
          unwrap: () =>
            Promise.reject({
              message: ACCOUNT_VALIDATION.INCORRECT_OLD_PASSWORD,
            }),
        };
      }

      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }

      return Promise.resolve({
        type: 'default',
      });
    });

    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    fireEvent.change(screen.getByPlaceholderText('Old Password'), {
      target: {
        value: 'wrong',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('New Password'), {
      target: {
        value: 'P@ss123!',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: {
        value: 'P@ss123!',
      },
    });

    fireEvent.click(screen.getByText('Update Password'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  test('updates password successfully', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'changePassword/changePassword') {
        return {
          unwrap: () => Promise.resolve('Password updated successfully'),
        };
      }

      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({
              full_name: 'Sanjay',
              email: 'test@gmail.com',
              role: 'District Admin',
            }),
        };
      }

      return Promise.resolve({
        type: 'default',
      });
    });

    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    fireEvent.change(screen.getByPlaceholderText('Old Password'), {
      target: {
        value: 'old123',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('New Password'), {
      target: {
        value: 'P@ss123!',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: {
        value: 'P@ss123!',
      },
    });

    fireEvent.click(screen.getByText('Update Password'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    // The dialog's own "Updating..." replaces the full-page loader.
    expect(changePasswordRequest).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true })
    );
    // Closes straight away rather than after a delay.
    expect(
      screen.queryByPlaceholderText('Old Password')
    ).not.toBeInTheDocument();
  });

  test('opens redeem code modal', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Add Subscription'));

    const redeemElements = await screen.findAllByText('Redeem Code Modal');
    expect(redeemElements.length).toBeGreaterThan(0);
  });

  test('redeem success shows the activated toast and closes the modal even if the profile refresh fails', async () => {
    // Regression: fetchCurrentUser() (GET /auth/me) is only a post-redeem
    // profile/seat refresh — a failure there must not block the success
    // toast or leave the redeem dialog open, since the redeem itself
    // already succeeded.
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/redeem') {
        return {
          unwrap: () =>
            Promise.resolve({ message: 'License activated successfully' }),
        };
      }
      if (action?.type === 'auth/Me') {
        return {
          unwrap: () => Promise.reject(new Error('Failed to load profile')),
        };
      }
      return Promise.resolve({ type: 'default' });
    });

    renderComponent();

    fireEvent.click(await screen.findByText('Add Subscription'));
    fireEvent.click(await screen.findByText('Submit Redeem Code'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/license.*activated/i)
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Redeem Code Modal')).not.toBeInTheDocument();
    });
  });

  test('redeem failure shows the error toast and keeps the modal open', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/redeem') {
        return {
          unwrap: () => Promise.reject(new Error('Invalid code')),
        };
      }
      if (action?.type === 'auth/Me') {
        return {
          unwrap: () =>
            Promise.resolve({ full_name: 'Sanjay', role: 'District Admin' }),
        };
      }
      return Promise.resolve({ type: 'default' });
    });

    renderComponent();

    fireEvent.click(await screen.findByText('Add Subscription'));
    fireEvent.click(await screen.findByText('Submit Redeem Code'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Redeem Code Modal')).toBeInTheDocument();
  });

  test('valid redeem code matches pattern', () => {
    const validCode = 'ABC123XYZ';

    expect(/^[A-Z0-9]+$/.test(validCode)).toBe(true);
  });

  test('invalid redeem code fails pattern', () => {
    const invalidCode = 'abc-123';

    expect(/^[A-Z0-9]+$/.test(invalidCode)).toBe(false);
  });

  describe('Change Password — password policy enforcement', () => {
    const invalidPasswords: [string, string][] = [
      ['test1234', 'missing uppercase and special character'],
      ['TEST@123', 'missing lowercase'],
      ['TestPass', 'missing number and special character'],
      ['Test1234', 'missing special character'],
      ['Te@1', 'less than 8 characters'],
      ['Short1!', 'only 7 characters'],
    ];

    test.each(invalidPasswords)(
      'shows complexity error for new password "%s" (%s)',
      async (invalidPassword) => {
        renderComponent();

        fireEvent.click(await screen.findByText('Change Password'));

        fireEvent.change(screen.getByPlaceholderText('Old Password'), {
          target: { value: 'OldP@ss1' },
        });
        fireEvent.change(screen.getByPlaceholderText('New Password'), {
          target: { value: invalidPassword },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: invalidPassword },
        });

        fireEvent.click(screen.getByText('Update Password'));

        await waitFor(() => {
          // Both new and confirm may show the same complexity message; verify at least one is present
          const complexityMessages = screen.getAllByText(
            ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY
          );
          expect(complexityMessages.length).toBeGreaterThanOrEqual(1);
        });
      }
    );

    test.each(invalidPasswords)(
      'shows complexity error for confirm password "%s" (%s)',
      async (invalidPassword) => {
        renderComponent();

        fireEvent.click(await screen.findByText('Change Password'));

        // Set old to something different from invalidPassword so OLD_NEW_PASSWORD_SAME doesn't fire
        fireEvent.change(screen.getByPlaceholderText('Old Password'), {
          target: { value: 'OldP@ss1' },
        });
        // Set new AND confirm to the same invalid password so mismatch does not overwrite complexity error
        fireEvent.change(screen.getByPlaceholderText('New Password'), {
          target: { value: invalidPassword },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: invalidPassword },
        });

        fireEvent.click(screen.getByText('Update Password'));

        await waitFor(() => {
          // Both new and confirm show the same complexity message; verify at least one is present
          const complexityMessages = screen.getAllByText(
            ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY
          );
          expect(complexityMessages.length).toBeGreaterThanOrEqual(1);
        });
      }
    );

    test('accepts passwords longer than 8 characters', async () => {
      mockDispatch.mockImplementation((action: ReduxAction) => {
        if (action?.type === 'changePassword') {
          return Promise.resolve({
            type: 'changePassword/fulfilled',
            payload: 'Password updated successfully',
          });
        }
        if (action?.type === 'auth/Me') {
          return {
            unwrap: () =>
              Promise.resolve({
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              }),
          };
        }
        return Promise.resolve({ type: 'default' });
      });

      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      fireEvent.change(screen.getByPlaceholderText('Old Password'), {
        target: { value: 'OldP@ssword1' },
      });
      fireEvent.change(screen.getByPlaceholderText('New Password'), {
        target: { value: 'MyLongP@ssword123' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'MyLongP@ssword123' },
      });

      fireEvent.click(screen.getByText('Update Password'));

      await waitFor(() => {
        expect(
          screen.queryByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY)
        ).not.toBeInTheDocument();
      });
    });

    const validLongPasswords: [string, string][] = [
      ['Password@1', 'exactly 10 chars — valid'],
      ['Welcome#2025', '12 chars — valid'],
      ['MySecurePass!123', '16 chars — valid'],
      ['SuperLongP@ssword99!', '20 chars — valid'],
    ];

    test.each(validLongPasswords)(
      'accepts valid long password "%s" (%s) without complexity error',
      async (validPassword) => {
        mockDispatch.mockImplementation((action: ReduxAction) => {
          if (action?.type === 'changePassword') {
            return Promise.resolve({
              type: 'changePassword/fulfilled',
              payload: 'Password updated successfully',
            });
          }
          if (action?.type === 'auth/Me') {
            return {
              unwrap: () =>
                Promise.resolve({
                  full_name: 'Sanjay',
                  email: 'test@gmail.com',
                  role: 'District Admin',
                }),
            };
          }
          return Promise.resolve({ type: 'default' });
        });

        renderComponent();

        fireEvent.click(await screen.findByText('Change Password'));

        fireEvent.change(screen.getByPlaceholderText('Old Password'), {
          target: { value: 'DifferentP@ss1' },
        });
        fireEvent.change(screen.getByPlaceholderText('New Password'), {
          target: { value: validPassword },
        });
        fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
          target: { value: validPassword },
        });

        fireEvent.click(screen.getByText('Update Password'));

        await waitFor(() => {
          expect(
            screen.queryByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY)
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY)
          ).not.toBeInTheDocument();
        });
      }
    );

    test('shows validation error on blur for empty new password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const newPasswordInput = screen.getByPlaceholderText('New Password');
      fireEvent.blur(newPasswordInput);

      await waitFor(() => {
        expect(
          screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED)
        ).toBeInTheDocument();
      });
    });

    test('shows complexity error on blur for invalid new password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const newPasswordInput = screen.getByPlaceholderText('New Password');
      fireEvent.change(newPasswordInput, { target: { value: 'short1!' } });
      fireEvent.blur(newPasswordInput);

      await waitFor(() => {
        expect(
          screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY)
        ).toBeInTheDocument();
      });
    });

    test('shows complexity error on blur for invalid confirm password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const confirmPasswordInput =
        screen.getByPlaceholderText('Confirm Password');
      fireEvent.change(confirmPasswordInput, {
        target: { value: 'nospecial1A' },
      });
      fireEvent.blur(confirmPasswordInput);

      await waitFor(() => {
        expect(
          screen.getByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY)
        ).toBeInTheDocument();
      });
    });

    test('shows mismatch error on blur for confirm password that does not match', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      fireEvent.change(screen.getByPlaceholderText('New Password'), {
        target: { value: 'ValidP@ss1' },
      });

      const confirmPasswordInput =
        screen.getByPlaceholderText('Confirm Password');
      fireEvent.change(confirmPasswordInput, {
        target: { value: 'DifferentP@ss2' },
      });
      fireEvent.blur(confirmPasswordInput);

      await waitFor(() => {
        expect(
          screen.getByText(ACCOUNT_VALIDATION.PASSWORD_MISMATCH)
        ).toBeInTheDocument();
      });
    });

    test('blocks form submission for invalid password (no special char)', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      fireEvent.change(screen.getByPlaceholderText('Old Password'), {
        target: { value: 'SomeOldP@ss1' },
      });
      fireEvent.change(screen.getByPlaceholderText('New Password'), {
        target: { value: 'Password123' }, // missing special char
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
        target: { value: 'Password123' },
      });

      fireEvent.click(screen.getByText('Update Password'));

      await waitFor(() => {
        // Both new and confirm fields show the same complexity message
        const complexityErrors = screen.getAllByText(
          ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY
        );
        expect(complexityErrors.length).toBeGreaterThanOrEqual(1);
        // dispatch should NOT have been called with changePassword
        expect(mockDispatch).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'changePassword' })
        );
      });
    });
  });
});

describe('Account Page — photo upload and removal states', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const meResponse = (profilePicture: string) => ({
    unwrap: () =>
      Promise.resolve({
        full_name: 'Sanjay',
        email: 'test@gmail.com',
        role: 'District Admin',
        profile_picture: profilePicture,
      }),
  });
  const pngFile = () =>
    new File(['dummy'], 'profile.png', { type: 'image/png' });
  const chooseFile = async (file: File) => {
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  test('shows the photo as busy until the upload finishes, then releases the preview', async () => {
    let finishUpload: (value: unknown) => void = () => {};
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return new Promise((resolve) => {
          finishUpload = resolve;
        });
      }
      if (action?.type === 'auth/Me') return meResponse('');
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    await screen.findByText('Add Photo');
    await chooseFile(pngFile());

    expect(screen.getByTestId('profile-photo-busy')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading photo…');
    // The avatar's own busy state replaces the full-page loader.
    expect(updateProfileRequest).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true })
    );
    // The preview is showing, so the links read Update / Remove.
    expect(screen.getByText('Update Photo')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText('Remove Photo')).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    // No rename mid-upload: the upload would write the old name back.
    expect(screen.getByText('Edit Profile')).toBeDisabled();

    // A second file dropped mid-upload is ignored.
    fireEvent.drop(screen.getByTestId('profile-photo-dropzone'), {
      dataTransfer: { files: [pngFile()] },
    });
    expect(updateProfileRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishUpload({ type: 'profile/update/fulfilled', payload: {} });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('profile-photo-busy')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(screen.getByText('Edit Profile')).toBeEnabled();
  });

  test('shows a generic message, never "undefined", when the upload fails without one', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'profile/update') {
        return Promise.resolve({ type: 'profile/update/rejected' });
      }
      if (action?.type === 'auth/Me') return meResponse('');
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    await screen.findByText('Add Photo');
    await chooseFile(pngFile());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        ACCOUNT_VALIDATION.UPDATE_FAILED
      );
    });
    expect(screen.queryByTestId('profile-photo-busy')).not.toBeInTheDocument();
  });

  test('removes the photo straight away, showing the busy state while it runs', async () => {
    let photo = 'https://cdn.example.com/profile.png';
    let finishRemove: (value: unknown) => void = () => {};
    mockDispatch.mockImplementation((action: unknown) => {
      // The real removeProfilePictureRequest thunk is dispatched as a function.
      if (typeof action === 'function') {
        return new Promise((resolve) => {
          finishRemove = resolve;
        });
      }
      if ((action as ReduxAction)?.type === 'auth/Me') return meResponse(photo);
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    fireEvent.click(await screen.findByText('Remove Photo'));

    // No confirmation step, matching the design.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-photo-busy')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Removing photo…');

    photo = '';
    await act(async () => {
      finishRemove({
        type: 'profile/removePicture/fulfilled',
        payload: { message: 'Photo removed' },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(await screen.findByText('Add Photo')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-photo-busy')).not.toBeInTheDocument();
  });
});

describe('Account Page — profile loading and unavailable states', () => {
  const defaultCachedUser = vi.mocked(getParsedUser).getMockImplementation();

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    // No saved copy, so the page has to wait for /auth/me.
    vi.mocked(getParsedUser).mockReturnValue(null);
  });

  afterEach(() => {
    if (defaultCachedUser) {
      vi.mocked(getParsedUser).mockImplementation(defaultCachedUser);
    }
  });

  const meAction = (result: () => Promise<unknown>) => ({ unwrap: result });

  test('shows a skeleton until the details arrive', async () => {
    let finishLoad: (value: unknown) => void = () => {};
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/Me') {
        return meAction(
          () =>
            new Promise((resolve) => {
              finishLoad = resolve;
            })
        );
      }
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    expect(screen.getByTestId('profile-card-skeleton')).toBeInTheDocument();
    expect(screen.getByText('Loading your profile…')).toBeInTheDocument();
    expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument();

    await act(async () => {
      finishLoad({
        full_name: 'Sanjay',
        email: 'test@gmail.com',
        role: 'District Admin',
      });
    });

    expect(await screen.findByText('test@gmail.com')).toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-card-skeleton')
    ).not.toBeInTheDocument();
  });

  test('shows a retry message when the details fail to load, and recovers on retry', async () => {
    let shouldFail = true;
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/Me') {
        return meAction(() =>
          shouldFail
            ? Promise.reject(new Error('Network Error'))
            : Promise.resolve({
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              })
        );
      }
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    expect(
      await screen.findByText("We couldn't load your profile")
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldFail = false;
    fireEvent.click(screen.getByText('Try again'));

    expect(await screen.findByText('test@gmail.com')).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load your profile")
    ).not.toBeInTheDocument();
  });

  test('keeps showing the saved copy when a background refresh fails', async () => {
    if (defaultCachedUser) {
      vi.mocked(getParsedUser).mockImplementation(defaultCachedUser);
    }
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/Me') {
        return meAction(() => Promise.reject(new Error('Network Error')));
      }
      return Promise.resolve({ type: 'default' });
    });

    render(<Account />, { wrapper: MemoryRouter });
    expect(await screen.findByText('test@gmail.com')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
    expect(
      screen.queryByText("We couldn't load your profile")
    ).not.toBeInTheDocument();
  });
});

describe('Account Page — educator seat summary', () => {
  const educator = {
    id: 1,
    full_name: 'Sanjay',
    email: 'test@gmail.com',
    role: 'Educator',
    profile_picture: '',
    ai_seats: { total: 20, consumed: 5, available: 15 },
  };
  const defaultGetParsedUser = vi.mocked(getParsedUser).getMockImplementation();

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(getParsedUser).mockImplementation(() => educator);
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'auth/Me') {
        return { unwrap: () => Promise.resolve(educator) };
      }
      return Promise.resolve({ type: 'default' });
    });
  });

  afterEach(() => {
    vi.mocked(getParsedUser).mockImplementation(
      defaultGetParsedUser ?? (() => null)
    );
  });

  const renderEducatorAccount = () =>
    render(<Account />, { wrapper: MemoryRouter });

  test('shows the remaining seats in the brand primary colour', async () => {
    renderEducatorAccount();

    const remaining = await screen.findByText('15');
    expect(remaining).toHaveClass('text-primary-500');
    expect(remaining).not.toHaveClass('text-[#F97316]');
  });

  test('uses the gradient Request More Seats button and opens the modal', async () => {
    renderEducatorAccount();

    const requestSeats = await screen.findByRole('button', {
      name: 'Request More Seats',
    });
    expect(requestSeats).toHaveAttribute('variant', 'gradient');
    expect(requestSeats).not.toHaveClass('bg-orange-500');

    fireEvent.click(requestSeats);
    expect(screen.getByTestId('request-seats-modal')).toBeInTheDocument();
  });
});
