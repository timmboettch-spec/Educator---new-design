import { fallbackRouteFor } from '../../../../src/features/auth/access/fallbackRouteFor';
import type { AccessContext } from '../../../../src/features/auth/access/types';
import { ROLE } from '../../../../src/features/auth/model/roles';
import { ROUTE_PATHS } from '../../../../src/routes/routePath';

const ctx = (overrides: Partial<AccessContext> = {}): AccessContext => ({
  role: ROLE.DISTRICT_ADMIN,
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  ...overrides,
});

describe('fallbackRouteFor', () => {
  it('sends an unauthenticated identity to login', () => {
    expect(fallbackRouteFor(ctx({ isAuthenticated: false }))).toBe(
      ROUTE_PATHS.auth.login
    );
  });

  it('sends an educator to the educator dashboard regardless of entitlement', () => {
    expect(
      fallbackRouteFor(ctx({ role: ROLE.EDUCATOR, isLicenseActive: false }))
    ).toBe(ROUTE_PATHS.dashboard.educator);
  });

  it('sends a licensed district admin to the admin dashboard', () => {
    expect(fallbackRouteFor(ctx())).toBe(ROUTE_PATHS.dashboard.admin);
  });

  it('sends an unlicensed district admin to redeem', () => {
    expect(
      fallbackRouteFor(ctx({ isLicenseActive: false, skippedRedeem: false }))
    ).toBe(ROUTE_PATHS.auth.redeem);
  });

  // Regression: a started trial used to count as entitlement, sending a denied trial
  // admin to /admin-dashboard — a page the sidebar never links them to. A trial gets
  // the catalogue and a redeem prompt, not the licensed pages.
  it('sends a district admin who only started a trial to redeem, not the dashboard', () => {
    expect(
      fallbackRouteFor(ctx({ isLicenseActive: false, skippedRedeem: true }))
    ).toBe(ROUTE_PATHS.auth.redeem);
  });

  it('sends an authenticated identity with no served role to the no-access screen', () => {
    // Not /login: the guest-only guard bounces authenticated users off /login, which
    // would send them straight back here and deadlock.
    expect(fallbackRouteFor(ctx({ role: null }))).toBe(
      ROUTE_PATHS.auth.noAccess
    );
  });

  it('never returns login for an authenticated identity', () => {
    const authenticated: AccessContext[] = [
      ctx({ role: ROLE.EDUCATOR }),
      ctx({ role: ROLE.DISTRICT_ADMIN }),
      ctx({ role: ROLE.DISTRICT_ADMIN, isLicenseActive: false }),
      ctx({ role: null }),
    ];
    for (const candidate of authenticated) {
      expect(fallbackRouteFor(candidate)).not.toBe(ROUTE_PATHS.auth.login);
    }
  });
});
