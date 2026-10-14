import type { FC, ReactNode } from 'react';
import type { RoleSlug } from '../../model/roles';

/**
 * The guard contract.
 *
 * A guard answers exactly one question: given `children`, should it render? Composing
 * several small guards beats one guard with three concerns — each stays independently
 * reusable, and the route config reads as a list of the conditions that protect a page.
 *
 * Every guard must also work **outside** the route config — around a tab, a panel or a
 * single control. A guard that only works at route level has its logic in the wrong
 * place.
 */
export type GuardProps = {
  children: ReactNode;
  /**
   * Overrides the guard's own denial target. Needed where a route sends a particular
   * identity somewhere specific rather than to its usual landing page.
   */
  redirect?: { to: string };
};

/** Feature flags that gate a route, as opposed to a role or an entitlement. */
export type FeatureKey = 'googleClassroom';

/**
 * The declarative form of what a guard checks.
 *
 * Guards are components, so navigation cannot ask them anything without rendering them.
 * Attaching the rule makes the same condition readable without rendering, which is what
 * lets the sidebar be derived from the route tree instead of maintained as a second
 * access table that drifts from the first.
 */
export type AccessRule =
  | { kind: 'role'; roles: readonly RoleSlug[] }
  | { kind: 'entitlement' }
  | { kind: 'feature'; feature: FeatureKey };

/**
 * `rules` is a list because a guard may check more than one thing: the Google Classroom
 * route is educator-only *and* feature-gated, and navigation has to evaluate both to
 * decide whether to show the link.
 */
export type GuardComponent = FC<GuardProps> & {
  rules?: readonly AccessRule[];
};
