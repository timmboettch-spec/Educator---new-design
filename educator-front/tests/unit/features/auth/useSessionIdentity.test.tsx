import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Parity harness.
 *
 * `useSessionIdentity` replaces a block of derivation that used to sit inline in
 * AppRouter. The risk of that move is not that the new code is wrong in the abstract,
 * but that it disagrees with the old code on some combination nobody thought about —
 * so this asserts the two agree across the whole matrix rather than on a few examples.
 */

let mockLogin: unknown = null;
let mockSignUp: unknown = null;
let mockSessionChecked = true;
let mockToken: string | null = null;
let mockUser: Record<string, unknown> | null = null;
let mockSkipped = false;
let mockLtiHandoff = false;
let mockDeadlinePassed = false;
const restartResolutionDeadline = vi.fn();

vi.mock('../../../../src/redux/auth/LoginRedux', () => ({
  selectLoginResponse: () => mockLogin,
  selectSessionChecked: () => mockSessionChecked,
}));
vi.mock('../../../../src/redux/auth/SignUpRedux', () => ({
  selectSignUpResponse: () => mockSignUp,
}));
vi.mock('../../../../src/store/hooks', () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector(undefined),
}));
vi.mock('../../../../src/utils/storage', () => ({
  getToken: () => mockToken,
  getParsedUser: () => mockUser,
}));
vi.mock('../../../../src/utils/sessionState', () => ({
  isLtiSessionHandoff: () => mockLtiHandoff,
  subscribeLtiSessionHandoff: () => () => undefined,
}));
vi.mock('../../../../src/utils/trialState', () => ({
  hasSkippedRedeem: () => mockSkipped,
  subscribeRedeemSkipped: () => () => undefined,
}));
vi.mock('../../../../src/features/auth/model/sessionResolution', () => ({
  hasResolutionDeadlinePassed: () => mockDeadlinePassed,
  subscribeResolutionDeadline: () => () => undefined,
  restartResolutionDeadline: () => restartResolutionDeadline(),
}));

import { useSessionIdentity } from '../../../../src/features/auth/model/useSessionIdentity';
import { fallbackRouteFor } from '../../../../src/features/auth/access/fallbackRouteFor';

const wrapperAt =
  (path: string) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );

const identityAt = (path = '/') =>
  renderHook(() => useSessionIdentity(), { wrapper: wrapperAt(path) }).result
    .current;

/**
 * The derivation AppRouter used before this hook existed — with one deliberate
 * divergence. The legacy code sent `skippedRedeem` alone to `/admin-dashboard`,
 * same as a real license; `fallbackRouteFor`/`hasEntitlement` no longer do, since
 * that let a trial admin reach `/admin-dashboard`, `/schools` and `/educators`
 * directly by URL even though the sidebar never linked them there. Parity is
 * intentionally broken for exactly the `hasActiveLicense=false, skippedRedeem=true`
 * case; every other case still agrees with the old code.
 */
const legacyRedirectPath = (
  isAuthenticated: boolean,
  legacyRole: string | undefined,
  hasActiveLicense: boolean,
  _skippedRedeem: boolean
): string => {
  if (!isAuthenticated) return '/login';
  if (legacyRole === 'educator') return '/educator-dashboard';
  if (hasActiveLicense) return '/admin-dashboard';
  return '/redeem';
};

beforeEach(() => {
  mockLogin = null;
  mockSignUp = null;
  mockSessionChecked = true;
  mockToken = null;
  mockUser = null;
  mockSkipped = false;
  mockLtiHandoff = false;
  mockDeadlinePassed = false;
  restartResolutionDeadline.mockClear();
});

describe('useSessionIdentity — authentication', () => {
  it.each([
    ['a real token', 'abc123', true],
    ['no token', null, false],
    ['the string "undefined"', 'undefined', false],
    ['the string "null"', 'null', false],
    ['an empty string', '', false],
  ])('treats %s as isAuthenticated=%s', (_label, token, expected) => {
    mockToken = token as string | null;
    mockUser = { role: 'Educator' };
    expect(identityAt().isAuthenticated).toBe(expected);
  });

  it('prefers the Redux login token over the cookie', () => {
    mockToken = 'cookie-token';
    mockLogin = { data: { tokens: { accessToken: 'redux-token' } } };
    expect(identityAt().accessToken).toBe('redux-token');
  });

  it('accepts the signup response as a session source', () => {
    // Signup auto-authenticates but never calls setAuthData, so Redux is the only
    // evidence a session exists. Dropping it strands a new admin on /login.
    mockSignUp = {
      data: {
        tokens: { accessToken: 'signup-token' },
        user: { role: 'District Admin' },
      },
    };
    const identity = identityAt();
    expect(identity.isAuthenticated).toBe(true);
    expect(identity.role).toBe('district_admin');
  });

  it('exposes no token when unauthenticated', () => {
    expect(identityAt().accessToken).toBeNull();
  });

  it('exposes the Redux user id before the cookie one', () => {
    mockToken = 't';
    mockUser = { id: 'cookie-user', role: 'Educator' };
    expect(identityAt().userId).toBe('cookie-user');

    mockLogin = { data: { user: { userId: 'redux-user', role: 'Educator' } } };
    expect(identityAt().userId).toBe('redux-user');
  });

  it('exposes no user id when unauthenticated or absent', () => {
    mockUser = { id: 'cookie-user', role: 'Educator' };
    expect(identityAt().userId).toBeNull();

    mockToken = 't';
    mockUser = { role: 'Educator' };
    expect(identityAt().userId).toBeNull();
  });
});

describe('useSessionIdentity — role resolution order', () => {
  it('prefers active_role_slug over everything else', () => {
    mockToken = 't';
    mockUser = {
      active_role_slug: 'educator',
      active_role_id: 'r1',
      available_roles: [{ id: 'r1', slug: 'district_admin' }],
      role: 'District Admin',
    };
    expect(identityAt().role).toBe('educator');
  });

  it('falls back to the available_roles lookup', () => {
    mockToken = 't';
    mockUser = {
      active_role_id: 'r2',
      available_roles: [
        { id: 'r1', slug: 'educator' },
        { id: 'r2', slug: 'district_admin' },
      ],
      role: 'Educator',
    };
    expect(identityAt().role).toBe('district_admin');
  });

  it('falls back to the display name (the LTI path)', () => {
    mockToken = 't';
    mockUser = { role: 'Educator' };
    expect(identityAt().role).toBe('educator');
  });

  it('resolves the legacy { role_name } object', () => {
    mockToken = 't';
    mockUser = { role: { role_name: 'District Admin' } };
    expect(identityAt().role).toBe('district_admin');
  });

  it('returns null for a role this portal does not serve', () => {
    mockToken = 't';
    mockUser = { role: 'student' };
    expect(identityAt().role).toBeNull();
  });
});

describe('useSessionIdentity — resolution and LTI suppression', () => {
  it('is unresolved until the session has been checked', () => {
    mockSessionChecked = false;
    expect(identityAt().isResolved).toBe(false);
  });

  it('is unresolved while an LTI handoff flag is raised', () => {
    mockLtiHandoff = true;
    expect(identityAt().isResolved).toBe(false);
  });

  it('is unresolved while the launch parameter is still on the URL', () => {
    // The flag is raised in an effect, one render too late — the parameter is what
    // covers that first render, and a redirect there would drop the one-time code.
    expect(identityAt('/login?lti_launch=success&code=abc').isResolved).toBe(
      false
    );
  });

  it('is unaffected by an unrelated query string', () => {
    expect(identityAt('/login?foo=bar').isResolved).toBe(true);
  });

  it('keeps isAuthenticated true during a handoff — only resolution is withheld', () => {
    mockLtiHandoff = true;
    mockToken = 'still-valid';
    mockUser = { role: 'Educator' };
    const identity = identityAt();
    expect(identity.isAuthenticated).toBe(true);
    expect(identity.isResolved).toBe(false);
  });

  // Regression: `isResolved` used to be `(sessionChecked || deadlinePassed) &&
  // !suppressAuthRouting`, so `suppressAuthRouting` cancelled the deadline out and a
  // wedged LTI handoff left every guard rendering its loader forever — exactly the
  // "unknown hang" the deadline exists to bound. The deadline must win regardless of
  // suppression, since a handoff that never completes is itself such a hang.
  it('resolves once the deadline passes, even mid-handoff', () => {
    mockLtiHandoff = true;
    mockSessionChecked = false;
    mockDeadlinePassed = true;
    expect(identityAt().isResolved).toBe(true);
  });

  it('resolves once the deadline passes, even with the launch parameter still on the URL', () => {
    mockSessionChecked = false;
    mockDeadlinePassed = true;
    expect(identityAt('/login?lti_launch=success&code=abc').isResolved).toBe(
      true
    );
  });

  it('stays unresolved mid-handoff before the deadline passes', () => {
    mockLtiHandoff = true;
    mockSessionChecked = false;
    mockDeadlinePassed = false;
    expect(identityAt().isResolved).toBe(false);
  });
});

describe('useSessionIdentity — restarting the deadline per handoff cycle', () => {
  // Regression: `hasResolutionDeadlinePassed()` is a one-shot flag for the tab's whole
  // lifetime (see sessionResolution.ts) — once true, it never resets on its own. Left
  // unrestarted, a handoff beginning any time after the first 8s of the tab's life
  // (i.e. almost always, in practice) would read as "deadline already passed" the
  // instant it starts, letting a guard treat the session as resolved while this exact
  // handoff is still swapping it out. `useSessionIdentity` must call
  // `restartResolutionDeadline()` on the rising edge of `suppressAuthRouting` so each
  // handoff gets its own fresh window, and must not call it on every render while one
  // is still in progress, or the deadline would never get the chance to fire.
  it('restarts the deadline exactly once when a handoff begins, not on every render', () => {
    const { rerender } = renderHook(() => useSessionIdentity(), {
      wrapper: wrapperAt('/login'),
    });
    expect(restartResolutionDeadline).not.toHaveBeenCalled();

    mockLtiHandoff = true;
    rerender();
    expect(restartResolutionDeadline).toHaveBeenCalledTimes(1);

    // Still mid-handoff on the next render — must not restart again.
    rerender();
    rerender();
    expect(restartResolutionDeadline).toHaveBeenCalledTimes(1);
  });

  it('restarts again on a second, later handoff', () => {
    const { rerender } = renderHook(() => useSessionIdentity(), {
      wrapper: wrapperAt('/login'),
    });

    mockLtiHandoff = true;
    rerender();
    expect(restartResolutionDeadline).toHaveBeenCalledTimes(1);

    mockLtiHandoff = false;
    rerender();
    expect(restartResolutionDeadline).toHaveBeenCalledTimes(1);

    mockLtiHandoff = true;
    rerender();
    expect(restartResolutionDeadline).toHaveBeenCalledTimes(2);
  });

  it('does not restart on mount when there is no handoff to bound', () => {
    renderHook(() => useSessionIdentity(), { wrapper: wrapperAt('/login') });
    expect(restartResolutionDeadline).not.toHaveBeenCalled();
  });
});

describe('useSessionIdentity — entitlement and feature flags', () => {
  it.each([
    ['is_license_active', { is_license_active: true }, true],
    ['isLicenseActive', { isLicenseActive: true }, true],
    ['neither', {}, false],
  ])('reads the license from %s', (_label, extra, expected) => {
    mockToken = 't';
    mockUser = { role: 'District Admin', ...(extra as object) };
    expect(identityAt().isLicenseActive).toBe(expected);
  });

  it('surfaces the trial flag from the store', () => {
    mockSkipped = true;
    expect(identityAt().skippedRedeem).toBe(true);
  });

  it.each([
    ['nothing set', {}, true],
    ['user flag false', { google_classroom_enabled: false }, false],
    [
      'school flag false',
      { school: { google_classroom_enabled: false } },
      false,
    ],
    ['both true', { google_classroom_enabled: true }, true],
    [
      'gc enabled on secondary school',
      {
        google_classroom_enabled: false,
        school: { google_classroom_enabled: false },
        schools: [
          { id: 'a', google_classroom_enabled: false },
          { id: 'b', google_classroom_enabled: true },
        ],
      },
      true,
    ],
  ])('resolves googleClassroomEnabled with %s', (_label, extra, expected) => {
    mockToken = 't';
    mockUser = { role: 'Educator', ...(extra as object) };
    expect(identityAt().googleClassroomEnabled).toBe(expected);
  });
});

describe('fallbackRouteFor matches the old getRedirectPath', () => {
  const roles: ReadonlyArray<[string | undefined, string]> = [
    ['Educator', 'educator'],
    ['educator', 'educator'],
    ['District Admin', 'district admin'],
    ['admin', 'admin'],
  ];

  for (const [stored, legacyRole] of roles) {
    for (const token of ['tok', null]) {
      for (const license of [true, false]) {
        for (const skipped of [true, false]) {
          it(`agrees for role=${stored} token=${!!token} license=${license} skipped=${skipped}`, () => {
            mockToken = token;
            mockSkipped = skipped;
            mockUser = { role: stored, is_license_active: license };

            const identity = identityAt();
            const legacy = legacyRedirectPath(
              !!token,
              legacyRole,
              license,
              skipped
            );

            expect(fallbackRouteFor(identity)).toBe(legacy);
          });
        }
      }
    }
  }
});
