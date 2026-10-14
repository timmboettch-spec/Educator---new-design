import { ROLE, type RoleSlug } from '../model/roles';
import type { AccessContext } from './types';

/**
 * Pure access predicates — no React, no routing, no side effects.
 *
 * Kept separate from the guards that wrap them so the same conditions can drive route
 * guards, sidebar visibility and action-level gating without being written twice. A
 * guard adds the loading branch and the denial destination; the decision itself lives
 * here, where it is trivially testable.
 */

/** Layer 4 — authorization. Does this identity's role allow the thing? */
export const hasRole = (
  ctx: AccessContext,
  allowed: readonly RoleSlug[]
): boolean => ctx.role !== null && allowed.includes(ctx.role);

/**
 * Layer 5 — entitlement. Has this account actually paid for the licensed part of the
 * product?
 *
 * Deliberately **not** `ctx.isLicenseActive || ctx.skippedRedeem`. A trial is the
 * catalogue-browsing experience, not a stand-in for a license: the routes this guards
 * (admin dashboard, schools, educators) are exactly the ones the sidebar already hides
 * from a trial account (see `navMeta.ts`'s `only.licensed`), so the guard has to agree
 * with the menu — otherwise a trial account can type in a URL for a page it was never
 * shown a link to. `skippedRedeem` still gates the trial's own pages directly
 * (`/simulation-catalog`, `/account`) through `anyRole`, which doesn't call this.
 *
 * Distinct from `hasRole` on purpose: a role denial is final, whereas a missing license
 * is a redeem prompt. Collapsing the two into one boolean throws away the information
 * needed to choose between those responses.
 */
export const hasEntitlement = (ctx: AccessContext): boolean =>
  ctx.isLicenseActive;

/**
 * Layer 3 — session readiness. Is the account in a state that can use this app at all?
 *
 * Today that means: authenticated, holding a role this portal serves. An account whose
 * only role is `student` or `scenario_admin` is authenticated and yet has nowhere to
 * go, and must be told so explicitly rather than shown an empty shell.
 */
export const isAccountUsable = (ctx: AccessContext): boolean =>
  ctx.isAuthenticated && ctx.role !== null;

/** Convenience for the two places that branch on "is this an educator session". */
export const isEducator = (ctx: AccessContext): boolean =>
  ctx.role === ROLE.EDUCATOR;

/** Convenience for the many places that branch on "is this a district admin session". */
export const isDistrictAdmin = (ctx: AccessContext): boolean =>
  ctx.role === ROLE.DISTRICT_ADMIN;
