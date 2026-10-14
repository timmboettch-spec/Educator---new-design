import {
  hasEntitlement,
  hasRole,
  isAccountUsable,
  isDistrictAdmin,
  isEducator,
} from '../../../../src/features/auth/access/predicates';
import type { AccessContext } from '../../../../src/features/auth/access/types';
import { ROLE } from '../../../../src/features/auth/model/roles';

const ctx = (overrides: Partial<AccessContext> = {}): AccessContext => ({
  role: ROLE.DISTRICT_ADMIN,
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  ...overrides,
});

describe('hasRole', () => {
  it('allows a role present in the list', () => {
    expect(hasRole(ctx({ role: ROLE.EDUCATOR }), [ROLE.EDUCATOR])).toBe(true);
  });

  it('allows either role when a route serves both', () => {
    const allowed = [ROLE.DISTRICT_ADMIN, ROLE.EDUCATOR];
    expect(hasRole(ctx({ role: ROLE.EDUCATOR }), allowed)).toBe(true);
    expect(hasRole(ctx({ role: ROLE.DISTRICT_ADMIN }), allowed)).toBe(true);
  });

  it('denies a role absent from the list', () => {
    expect(hasRole(ctx({ role: ROLE.DISTRICT_ADMIN }), [ROLE.EDUCATOR])).toBe(
      false
    );
  });

  it('denies a null role rather than treating it as a wildcard', () => {
    expect(hasRole(ctx({ role: null }), [ROLE.EDUCATOR])).toBe(false);
    expect(hasRole(ctx({ role: null }), [])).toBe(false);
  });
});

describe('hasEntitlement', () => {
  it('is satisfied by an active license', () => {
    expect(hasEntitlement(ctx({ isLicenseActive: true }))).toBe(true);
  });

  // Regression: a trial used to satisfy entitlement too, which let a trial admin
  // reach /admin-dashboard, /schools and /educators directly by URL even though the
  // sidebar never links them there — the guard and the menu disagreed. A trial is the
  // catalogue-browsing experience, not a stand-in for a license.
  it('is not satisfied by a started trial alone', () => {
    expect(
      hasEntitlement(ctx({ isLicenseActive: false, skippedRedeem: true }))
    ).toBe(false);
  });

  it('is not satisfied by neither', () => {
    expect(
      hasEntitlement(ctx({ isLicenseActive: false, skippedRedeem: false }))
    ).toBe(false);
  });

  it('is independent of role — entitlement is its own axis', () => {
    const licensed = { isLicenseActive: true, skippedRedeem: false };
    expect(hasEntitlement(ctx({ ...licensed, role: ROLE.EDUCATOR }))).toBe(
      true
    );
    expect(hasEntitlement(ctx({ ...licensed, role: null }))).toBe(true);
  });
});

describe('isAccountUsable', () => {
  it('accepts an authenticated session holding a served role', () => {
    expect(isAccountUsable(ctx())).toBe(true);
  });

  it('rejects an authenticated session with no served role', () => {
    // A student or scenario_admin account: authenticated, but nowhere to go.
    expect(isAccountUsable(ctx({ role: null }))).toBe(false);
  });

  it('rejects an unauthenticated session', () => {
    expect(isAccountUsable(ctx({ isAuthenticated: false }))).toBe(false);
  });

  it('does not depend on entitlement — a trial admin can still use the app', () => {
    expect(
      isAccountUsable(ctx({ isLicenseActive: false, skippedRedeem: false }))
    ).toBe(true);
  });
});

describe('role conveniences', () => {
  it('distinguishes the two roles and neither', () => {
    expect(isEducator(ctx({ role: ROLE.EDUCATOR }))).toBe(true);
    expect(isEducator(ctx({ role: ROLE.DISTRICT_ADMIN }))).toBe(false);
    expect(isDistrictAdmin(ctx({ role: ROLE.DISTRICT_ADMIN }))).toBe(true);
    expect(isDistrictAdmin(ctx({ role: ROLE.EDUCATOR }))).toBe(false);
    expect(isEducator(ctx({ role: null }))).toBe(false);
    expect(isDistrictAdmin(ctx({ role: null }))).toBe(false);
  });
});
