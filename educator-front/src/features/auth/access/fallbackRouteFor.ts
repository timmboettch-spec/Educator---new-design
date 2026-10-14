import { ROUTE_PATHS } from '../../../routes/routePath';
import { ROLE } from '../model/roles';
import { hasEntitlement } from './predicates';
import type { AccessContext } from './types';

/**
 * Where a denied identity should be sent.
 *
 * One ladder, used by every guard's denial branch *and* by the post-login redirect, so
 * the two can never disagree. Redirecting every denied user to the same page strands
 * whichever roles cannot reach that page either, which is why the destination is
 * derived from the identity rather than fixed per route.
 *
 * Transcribed from the `getRedirectPath()` it replaces, with one deliberate change:
 * an authenticated identity holding no serveable role now lands on `noAccess` rather
 * than falling through to the admin branch. Returning `/login` here instead would
 * deadlock — the guest-only guard bounces authenticated users off `/login`, straight
 * back to this function.
 */
export const fallbackRouteFor = (ctx: AccessContext): string => {
  if (!ctx.isAuthenticated) {
    return ROUTE_PATHS.auth.login;
  }

  if (ctx.role === ROLE.EDUCATOR) {
    return ROUTE_PATHS.dashboard.educator;
  }

  if (ctx.role === ROLE.DISTRICT_ADMIN) {
    return hasEntitlement(ctx)
      ? ROUTE_PATHS.dashboard.admin
      : ROUTE_PATHS.auth.redeem;
  }

  return ROUTE_PATHS.auth.noAccess;
};
