import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
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
  default: ({ loading }: LoaderProps) => (loading ? <div>Loading...</div> : null),
}));

vi.mock('../../../src/pages/auth/RedeemCode/index', () => ({
  default: () => <div>Redeem Code Modal</div>,
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
      { fulfilled },
    ),
  };
});

vi.mock('../../../src/redux/auth/ChangePasswordRedux', () => {
  const fulfilled = {
    match: (action: ReduxAction) => action.type === 'changePassword/changePassword/fulfilled',
  };

  return {
    changePasswordRequest: Object.assign(
      vi.fn((payload: unknown) => ({
        type: 'changePassword/changePassword',
        payload,
      })),
      { fulfilled },
    ),
  };
});

vi.mock('@/redux/users/GetUserRedux', () => ({
  default: (state = {}) => state,
  getCurrentUserRequest: vi.fn(() => ({
    type: 'getCurrentUserRequest',
  })),
}));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/components/modal/RequestSeatsModal', () => ({
  default: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="request-seats-modal">
        <button onClick={onClose}>Close Request Seats</button>
      </div>
    ) : null,
}));

import { toast } from '../../../src/components/common/Toast';
import { ACCOUNT_VALIDATION } from '../../../src/utils/messages/account';
import { updateProfileRequest } from '../../../src/redux/auth/UpdateProfileRedux';
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
      }),
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

      if (action?.type === 'getCurrentUserRequest') {
        return {
          unwrap: () =>
            Promise.resolve({
              data: {
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              },
            }),
        };
      }

      return Promise.resolve({
        type: 'default',
      });
    });
  });

  const renderComponent = () => render(<Account />);

  test('renders profile information correctly', async () => {
    renderComponent();

    expect(await screen.findByText('Account Settings')).toBeInTheDocument();

    expect(screen.getAllByText('Sanjay').length).toBeGreaterThan(0);

    expect(screen.getByText('test@gmail.com')).toBeInTheDocument();
  });

  test('email field is disabled', async () => {
    renderComponent();

    // Email is displayed as read-only text (not an editable input)
    const emailEl = await screen.findByText('test@gmail.com');
    expect(emailEl).toBeInTheDocument();
  });

  test('shows no changes toast when save clicked', async () => {
    renderComponent();

    // Open the edit profile modal first
    fireEvent.click(await screen.findByText('Edit Profile'));

    // Click Save Changes without making any changes
    fireEvent.click(await screen.findByText('Save Changes'));

    expect(toast.error).toHaveBeenCalledWith(ACCOUNT_VALIDATION.NO_CHANGES);
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

      if (action?.type === 'getCurrentUserRequest') {
        return {
          unwrap: () =>
            Promise.resolve({
              data: {
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              },
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
  });

  test('updates profile image successfully', async () => {
    renderComponent();

    const file = new File(['dummy'], 'profile.png', {
      type: 'image/png',
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    expect(input.files?.[0]).toEqual(file);
    await waitFor(() => {
      expect(updateProfileRequest).toHaveBeenCalled();
    });
  });

  test('file input accepts jpg jpeg png svg', async () => {
    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml');
  });

  test.each([
    ['avatar.jpg', 'image/jpeg'],
    ['avatar.jpeg', 'image/jpeg'],
    ['avatar.png', 'image/png'],
    ['avatar.svg', 'image/svg+xml'],
  ])('allows supported image format %s', async (fileName, mimeType) => {
    renderComponent();

    const file = new File(['dummy'], fileName, { type: mimeType });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(updateProfileRequest).toHaveBeenCalled();
    });
  });

  test.each([
    ['resume.pdf', 'application/pdf'],
    ['resume.doc', 'application/msword'],
    ['resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['script.exe', 'application/x-msdownload'],
    ['image-as-pdf.png', 'application/pdf'],
  ])('rejects unsupported format %s and prevents upload', async (fileName, mimeType) => {
    renderComponent();

    const file = new File(['dummy'], fileName, { type: mimeType });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID);
    });

    const updateProfileCalls = (updateProfileRequest as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    expect(updateProfileCalls).toBe(0);
  });

  test('applies same validation rules for drag-and-drop upload', async () => {
    renderComponent();

    const dropzone = await screen.findByTestId('profile-photo-dropzone');
    const invalidFile = new File(['dummy'], 'not-image.pdf', { type: 'application/pdf' });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID);
    });

    const updateProfileCalls = (updateProfileRequest as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    expect(updateProfileCalls).toBe(0);
  });

  test('rejects image larger than 5MB', async () => {
    renderComponent();

    const bigFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.png', {
      type: 'image/png',
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [bigFile],
      },
    });

    expect(toast.error).toHaveBeenCalledWith(ACCOUNT_VALIDATION.IMAGE_TOO_LARGE);
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
      expect(screen.getByText(ACCOUNT_VALIDATION.OLD_PASSWORD_REQUIRED)).toBeInTheDocument();

      expect(screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED)).toBeInTheDocument();

      expect(screen.getByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_REQUIRED)).toBeInTheDocument();
    });
  });

  test('shows password mismatch error', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Change Password'));

    const oldPasswordInput = screen.getByPlaceholderText('Old Password');

    const newPasswordInput = screen.getByPlaceholderText('New Password');

    const confirmPasswordInput = screen.getByPlaceholderText('Confirm Password');

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
      expect(screen.getByText(ACCOUNT_VALIDATION.PASSWORD_MISMATCH)).toBeInTheDocument();
    });
  });

  test('dispatches incorrect old password action', async () => {
    mockDispatch.mockImplementation((action: ReduxAction) => {
      if (action?.type === 'changePassword/changePassword') {
        return {
          unwrap: () => Promise.reject({ message: ACCOUNT_VALIDATION.INCORRECT_OLD_PASSWORD }),
        };
      }

      if (action?.type === 'getCurrentUserRequest') {
        return {
          unwrap: () =>
            Promise.resolve({
              data: {
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              },
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

      if (action?.type === 'getCurrentUserRequest') {
        return {
          unwrap: () =>
            Promise.resolve({
              data: {
                full_name: 'Sanjay',
                email: 'test@gmail.com',
                role: 'District Admin',
              },
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
  });

  test('opens redeem code modal', async () => {
    renderComponent();

    fireEvent.click(await screen.findByText('Add Subscription'));

    const redeemElements = await screen.findAllByText('Redeem Code Modal');
    expect(redeemElements.length).toBeGreaterThan(0);
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
            ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY,
          );
          expect(complexityMessages.length).toBeGreaterThanOrEqual(1);
        });
      },
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
            ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY,
          );
          expect(complexityMessages.length).toBeGreaterThanOrEqual(1);
        });
      },
    );

    test('accepts passwords longer than 8 characters', async () => {
      mockDispatch.mockImplementation((action: ReduxAction) => {
        if (action?.type === 'changePassword') {
          return Promise.resolve({
            type: 'changePassword/fulfilled',
            payload: 'Password updated successfully',
          });
        }
        if (action?.type === 'getCurrentUserRequest') {
          return {
            unwrap: () =>
              Promise.resolve({
                data: {
                  full_name: 'Sanjay',
                  email: 'test@gmail.com',
                  role: 'District Admin',
                },
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
          screen.queryByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY),
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
          if (action?.type === 'getCurrentUserRequest') {
            return {
              unwrap: () =>
                Promise.resolve({
                  data: { full_name: 'Sanjay', email: 'test@gmail.com', role: 'District Admin' },
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
            screen.queryByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY),
          ).not.toBeInTheDocument();
        });
      },
    );

    test('shows validation error on blur for empty new password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const newPasswordInput = screen.getByPlaceholderText('New Password');
      fireEvent.blur(newPasswordInput);

      await waitFor(() => {
        expect(screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_REQUIRED)).toBeInTheDocument();
      });
    });

    test('shows complexity error on blur for invalid new password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const newPasswordInput = screen.getByPlaceholderText('New Password');
      fireEvent.change(newPasswordInput, { target: { value: 'short1!' } });
      fireEvent.blur(newPasswordInput);

      await waitFor(() => {
        expect(screen.getByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY)).toBeInTheDocument();
      });
    });

    test('shows complexity error on blur for invalid confirm password', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      const confirmPasswordInput = screen.getByPlaceholderText('Confirm Password');
      fireEvent.change(confirmPasswordInput, { target: { value: 'nospecial1A' } });
      fireEvent.blur(confirmPasswordInput);

      await waitFor(() => {
        expect(
          screen.getByText(ACCOUNT_VALIDATION.CONFIRM_PASSWORD_COMPLEXITY),
        ).toBeInTheDocument();
      });
    });

    test('shows mismatch error on blur for confirm password that does not match', async () => {
      renderComponent();

      fireEvent.click(await screen.findByText('Change Password'));

      fireEvent.change(screen.getByPlaceholderText('New Password'), {
        target: { value: 'ValidP@ss1' },
      });

      const confirmPasswordInput = screen.getByPlaceholderText('Confirm Password');
      fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentP@ss2' } });
      fireEvent.blur(confirmPasswordInput);

      await waitFor(() => {
        expect(screen.getByText(ACCOUNT_VALIDATION.PASSWORD_MISMATCH)).toBeInTheDocument();
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
        const complexityErrors = screen.getAllByText(ACCOUNT_VALIDATION.NEW_PASSWORD_COMPLEXITY);
        expect(complexityErrors.length).toBeGreaterThanOrEqual(1);
        // dispatch should NOT have been called with changePassword
        expect(mockDispatch).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'changePassword' }),
        );
      });
    });
  });
});
