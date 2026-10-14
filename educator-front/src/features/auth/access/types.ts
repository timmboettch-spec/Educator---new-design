import type { RoleSlug } from '../model/roles';

/**
 * The minimal facts every access decision needs.
 *
 * Guards, the sidebar and in-page action gates all read this same shape, so a rule can
 * never be expressed one way for a route and another way for the link that points at
 * it. `SessionIdentity` (added in the next phase) is assignable to it.
 */
export type AccessContext = {
  /**
   * The active role, or `null` when the session is unauthenticated or holds only roles
   * this portal does not serve. Never a guess — see `coerceRole`.
   */
  role: RoleSlug | null;

  /** Backend-asserted license state (`districtAdmin.isLicenseActive`). */
  isLicenseActive: boolean;

  /**
   * The user chose "Start Trial" rather than redeeming a code. Session-scoped, and an
   * account state rather than an identity — which is why it is kept out of the role
   * catalogue and folded into the entitlement axis instead.
   */
  skippedRedeem: boolean;

  isAuthenticated: boolean;

  /**
   * `false` while the session is still being resolved.
   *
   * This is the third state, and the reason it exists: treating "resolving" as "denied"
   * logs users out on every hard refresh, and treating it as "allowed" flashes
   * protected content before redirecting. Every guard branches on it first.
   */
  isResolved: boolean;
};
