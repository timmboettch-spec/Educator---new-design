import { describe, expect, it } from 'vitest';

import LoginReducer, {
  LoginRequest,
  restoreSession,
} from '../../../src/redux/auth/LoginRedux';
import { normalizeAuthUser } from '../../../src/utils/normalizeAuthUser';

const fulfilled = (data: Record<string, unknown>) =>
  LoginReducer(
    undefined,
    LoginRequest.fulfilled({ message: 'ok', data } as never, 'request-id', {
      email: 'a@example.com',
      password: 'x',
    } as never)
  );

const tokens = { accessToken: 'token', csrfToken: 'csrf' };

const educatorLogin = {
  accessStatus: 'access_granted',
  tokens,
  activeRole: { id: 'r1', name: 'Educator', slug: 'educator' },
  user: {
    userId: 'u1',
    userRoles: [{ id: 'r1', name: 'Educator', slug: 'educator' }],
  },
};

describe('LoginRedux – LoginRequest.fulfilled', () => {
  it('marks the request succeeded and the session checked', () => {
    const state = fulfilled(educatorLogin);
    expect(state.status).toBe('succeeded');
    expect(state.sessionChecked).toBe(true);
    expect(state.error).toBeNull();
  });

  // Regression: the raw user only carries `userRoles[]`, so storing it here let
  // the guards see a token with no resolvable role and redirect to /no-access
  // (and let a dashboard mount before SignIn wrote the token to storage).
  it('does not commit the raw login response as a session', () => {
    expect(fulfilled(educatorLogin).responseLogin).toBeNull();
  });

  it.each([
    [
      'a role this app cannot route',
      {
        accessStatus: 'access_granted',
        tokens,
        user: {
          userId: 'u1',
          userRoles: [{ id: 'r1', name: 'Student', slug: 'student' }],
        },
      },
    ],
    [
      'a login that still needs a role picked',
      {
        accessStatus: 'required_role_selection',
        tokens,
        user: { userId: 'u1', userRoles: [] },
      },
    ],
    [
      'a legacy login with no role list',
      { tokens, user: { id: 'u1', email: 'a@example.com', role: 'Educator' } },
    ],
  ])('does not commit %s either', (_label, data) => {
    expect(fulfilled(data).responseLogin).toBeNull();
  });

  it('keeps an already-restored session untouched', () => {
    const restored = LoginReducer(
      undefined,
      restoreSession({ data: { tokens, user: { id: 'u0' } }, message: '' })
    );
    const state = LoginReducer(
      restored,
      LoginRequest.fulfilled(
        { message: 'ok', data: educatorLogin } as never,
        'request-id',
        { email: 'a@example.com', password: 'x' }
      )
    );
    expect(state.responseLogin?.data.user).toEqual({ id: 'u0' });
  });
});

describe('LoginRedux – restoreSession (the commit SignIn performs)', () => {
  it('stores the normalized user, whose role the guards can resolve', () => {
    const user = normalizeAuthUser(
      educatorLogin.user,
      educatorLogin.activeRole
    );
    const state = LoginReducer(
      undefined,
      restoreSession({ data: { tokens, user }, message: '' })
    );
    expect(state.responseLogin?.data.tokens).toEqual(tokens);
    expect(state.responseLogin?.data.user).toMatchObject({
      role: 'Educator',
      active_role_slug: 'educator',
    });
    expect(state.status).toBe('succeeded');
    expect(state.sessionChecked).toBe(true);
  });
});
