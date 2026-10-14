import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import RedeemHeader from '../../../src/components/common/RedeemHeader';
import type { RootState } from '../../../src/store/index';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  cancelText: string;
}

const store = configureStore({
  reducer: {
    Login: () => ({
      responseLogin: {
        data: {
          user: {
            full_name: 'Arthi',
          },
        },
      },
    }),

    SignUp: () => ({
      responseSignUp: null,
    }),
  },
});

const mockDispatch = vi.fn();

vi.mock('../../../src/store/hooks', async () => {
  const rr = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    useAppDispatch: () => mockDispatch,
    useAppSelector:
      rr.useSelector as typeof import('../../../src/store/hooks').useAppSelector,
  };
});

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  selectLoginResponse: (state: RootState) => state?.Login?.responseLogin,
  logout: vi.fn(() => ({ type: 'auth/login/logout' })),
}));

vi.mock('../../../src/redux/auth/SignUpRedux', () => ({
  selectSignUpResponse: (state: RootState) => state?.SignUp?.responseSignUp,
}));

vi.mock('../../../src/redux/auth/LogoutRedux', () => ({
  LogoutRequest: vi.fn(() => ({
    unwrap: vi.fn(),
  })),
  resetLogout: vi.fn(() => ({ type: 'auth/logout/reset' })),
}));

vi.mock('../../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/storage')>()),
  getParsedUser: vi.fn(() => null),
}));

import { getParsedUser } from '../../../src/utils/storage';

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/components/modal/ConfirmationModal', () => ({
  default: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
  }: ConfirmationModalProps) =>
    isOpen ? (
      <div>
        <p>{title}</p>
        <p>{message}</p>
        <button onClick={onConfirm}>{confirmText}</button>
        <button onClick={onCancel}>{cancelText}</button>
      </div>
    ) : null,
}));

describe('RedeemHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem(
      'user',
      JSON.stringify({
        full_name: 'John Doe',
        profile_image: '',
      })
    );
  });

  test('renders logo and title', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('Realityworks')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  test('renders profile initial when no image', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('renders notification bell', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>
    );

    const bellIcon = document.querySelector('svg');

    expect(bellIcon).toBeInTheDocument();
  });

  test('calls notification click', () => {
    const onClickNotification = vi.fn();

    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader onClickNotification={onClickNotification} />
        </Provider>
      </MemoryRouter>
    );

    const bellIcons = document.querySelectorAll('svg');

    fireEvent.click(bellIcons[0]);

    expect(onClickNotification).toHaveBeenCalled();
  });

  test('opens confirmation modal on logout click', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button');

    fireEvent.click(buttons[0]);

    expect(screen.getByText('Do you want to Sign Out?')).toBeInTheDocument();
  });

  test('closes confirmation modal on cancel', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button');

    fireEvent.click(buttons[0]);

    fireEvent.click(screen.getByText('No'));

    expect(
      screen.queryByText('Do you want to Sign Out?')
    ).not.toBeInTheDocument();
  });

  describe('profile details', () => {
    const renderRedeemHeader = () =>
      render(
        <MemoryRouter>
          <Provider store={store}>
            <RedeemHeader />
          </Provider>
        </MemoryRouter>
      );

    beforeEach(() => {
      vi.mocked(getParsedUser).mockReturnValue(null);
    });

    test('prefers the saved user over the sign-in response', () => {
      vi.mocked(getParsedUser).mockReturnValue({ full_name: 'Zara' });
      renderRedeemHeader();
      expect(screen.getByText('Z')).toBeInTheDocument();
    });

    test('does not bring back a removed photo from the sign-in details', () => {
      // After Remove Photo, /auth/me saves profile_picture as null.
      vi.mocked(getParsedUser).mockReturnValue({
        full_name: 'Zara',
        profile_picture: null,
      });
      render(
        <MemoryRouter>
          <Provider
            store={configureStore({
              reducer: {
                Login: () => ({
                  responseLogin: {
                    data: {
                      user: {
                        full_name: 'Zara',
                        profile_picture: 'https://cdn.example.com/old.png',
                      },
                    },
                  },
                }),
                SignUp: () => ({ responseSignUp: null }),
              },
            })}
          >
            <RedeemHeader />
          </Provider>
        </MemoryRouter>
      );

      expect(screen.queryByAltText('Zara')).not.toBeInTheDocument();
      expect(screen.getByText('Z')).toBeInTheDocument();
    });

    test('follows a name change made on the Account page', () => {
      renderRedeemHeader();
      expect(screen.getByText('A')).toBeInTheDocument();

      vi.mocked(getParsedUser).mockReturnValue({ full_name: 'Bea' });
      act(() => {
        window.dispatchEvent(new Event('profile-updated'));
      });
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    test('shows the saved profile picture and falls back to the initial if it fails', () => {
      vi.mocked(getParsedUser).mockReturnValue({
        full_name: 'Zara',
        profile_picture: 'https://cdn.example.com/zara.png',
      });
      renderRedeemHeader();

      const avatar = screen.getByAltText('Zara');
      expect(avatar).toHaveAttribute('src', 'https://cdn.example.com/zara.png');
      fireEvent.error(avatar);
      expect(screen.queryByAltText('Zara')).not.toBeInTheDocument();
      expect(screen.getByText('Z')).toBeInTheDocument();
    });
  });
});
