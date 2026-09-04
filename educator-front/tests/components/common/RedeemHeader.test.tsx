import { render, screen, fireEvent } from '@testing-library/react';
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
    useAppSelector: rr.useSelector as typeof import('../../../src/store/hooks').useAppSelector,
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
      }),
    );
  });

  test('renders logo and title', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>,
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
      </MemoryRouter>,
    );

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('renders notification bell', () => {
    render(
      <MemoryRouter>
        <Provider store={store}>
          <RedeemHeader />
        </Provider>
      </MemoryRouter>,
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
      </MemoryRouter>,
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
      </MemoryRouter>,
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
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button');

    fireEvent.click(buttons[0]);

    fireEvent.click(screen.getByText('No'));

    expect(screen.queryByText('Do you want to Sign Out?')).not.toBeInTheDocument();
  });
});
