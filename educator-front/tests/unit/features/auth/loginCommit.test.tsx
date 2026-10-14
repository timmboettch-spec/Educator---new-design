import { act, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression: a successful login used to flash the "no access" screen.
 *
 * `LoginRequest.fulfilled` stored the raw login response, whose user carries only
 * `userRoles[]`. React rendered that state before SignIn's `finishLogin` stored the
 * normalized user, so `GuestOnly` saw a token with no resolvable role and redirected
 * to /no-access. Uses the real reducers, guard and identity hook; only storage is
 * stubbed, as a first-time visitor with nothing persisted yet.
 */

vi.mock('../../../../src/utils/storage', () => ({
  getToken: () => null,
  getParsedUser: () => null,
}));

import loginReducer, {
  LoginRequest,
  restoreSession,
} from '../../../../src/redux/auth/LoginRedux';
import signUpReducer from '../../../../src/redux/auth/SignUpRedux';
import { GuestOnly } from '../../../../src/features/auth/access/guards';
import { normalizeAuthUser } from '../../../../src/utils/normalizeAuthUser';

const tokens = { accessToken: 'token', csrfToken: 'csrf' };
const activeRole = { id: 'r1', name: 'Educator', slug: 'educator' };
const rawUser = { userId: 'u1', userRoles: [activeRole] };

const renderLoginPage = () => {
  const store = configureStore({
    reducer: { Login: loginReducer, SignUp: signUpReducer },
  });
  store.dispatch({ type: 'auth/login/markSessionChecked' });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <div>login-form</div>
              </GuestOnly>
            }
          />
          <Route path="/no-access" element={<div>no-access</div>} />
          <Route
            path="/educator-dashboard"
            element={<div>educator-dashboard</div>}
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
};

describe('login commit', () => {
  it('stays on the login form when the login request resolves', () => {
    const store = renderLoginPage();

    act(() => {
      store.dispatch(
        LoginRequest.fulfilled(
          {
            message: 'ok',
            data: {
              accessStatus: 'access_granted',
              tokens,
              activeRole,
              user: rawUser,
            },
          } as never,
          'request-id',
          { email: 'a@example.com', password: 'x' }
        )
      );
    });

    expect(screen.getByText('login-form')).toBeInTheDocument();
    expect(screen.queryByText('no-access')).not.toBeInTheDocument();
  });

  it('routes to the role dashboard once SignIn commits the normalized session', () => {
    const store = renderLoginPage();

    act(() => {
      store.dispatch(
        restoreSession({
          data: { tokens, user: normalizeAuthUser(rawUser, activeRole) },
          message: '',
        })
      );
    });

    expect(screen.getByText('educator-dashboard')).toBeInTheDocument();
    expect(screen.queryByText('no-access')).not.toBeInTheDocument();
  });
});
