import type { AccessContext } from '../features/auth/access/types';
import type { AccessRule } from '../features/auth/access/guards';
import { isFeatureEnabled } from '../features/auth/access/guards';
import { hasEntitlement, hasRole } from '../features/auth/access/predicates';
import { ROLE } from '../features/auth/model/roles';
import type { NavMeta } from './navMeta';
import type { RouteNode } from './renderRoutes';

/**
 * Derives the navigation menu from the route tree.
 *
 * A visible link to a route the visitor will be bounced from is a bug, and the usual
 * cause is two separate lists of who-can-see-what falling out of step. Here there is
 * one list: a route is navigable because it carries `nav`, and it is *shown* when the
 * very rules its guards enforce are satisfied.
 *
 * This is possible only because guards expose their rules as data. Guards are
 * components, so without that the menu would have to render each one to ask it
 * anything.
 */

/**
 * What the menu needs to know about the viewer: the access facts, plus the feature
 * flags a route may be gated on. `SessionIdentity` satisfies it.
 */
export type NavContext = AccessContext & { googleClassroomEnabled: boolean };

export type NavEntry = {
  path: string;
  labelKey: NavMeta['labelKey'];
  icon: NavMeta['icon'];
};

const ruleAllows = (rule: AccessRule, ctx: NavContext): boolean => {
  switch (rule.kind) {
    case 'role':
      return hasRole(ctx, rule.roles);
    case 'entitlement':
      return hasEntitlement(ctx);
    case 'feature':
      return isFeatureEnabled(rule.feature, ctx);
    default:
      // Fail closed: an unrecognised rule hides the link rather than showing it.
      return false;
  }
};

/** Every rule the node's own guards enforce, flattened. */
const rulesOf = (node: RouteNode): AccessRule[] =>
  (node.guards ?? []).flatMap((guard) => [...(guard.rules ?? [])]);

const narrowingAllows = (nav: NavMeta, ctx: NavContext): boolean => {
  const { only } = nav;
  if (!only) {
    return true;
  }
  if (only.roles && !hasRole(ctx, only.roles)) {
    return false;
  }
  // Licensing is a district-admin concept; an educator's session may still carry a
  // stray top-level `is_license_active`, which must not reshape their menu.
  if (
    only.licensed !== undefined &&
    ctx.role === ROLE.DISTRICT_ADMIN &&
    ctx.isLicenseActive !== only.licensed
  ) {
    return false;
  }
  return true;
};

const collect = (nodes: RouteNode[]): RouteNode[] =>
  nodes.flatMap((node) => [node, ...collect(node.children ?? [])]);

/**
 * The menu for a given identity, ordered.
 *
 * Returns nothing at all until the session has resolved, so the sidebar does not flash
 * one role's menu before settling on another's.
 */
export const navItemsFor = (tree: RouteNode[], ctx: NavContext): NavEntry[] => {
  if (!ctx.isResolved || !ctx.isAuthenticated) {
    return [];
  }

  return collect(tree)
    .filter((node): node is RouteNode & { nav: NavMeta; path: string } =>
      Boolean(node.nav && node.path)
    )
    .filter(
      (node) =>
        rulesOf(node).every((rule) => ruleAllows(rule, ctx)) &&
        narrowingAllows(node.nav, ctx)
    )
    .sort((a, b) => a.nav.order - b.nav.order)
    .map((node) => ({
      path: node.path,
      labelKey: node.nav.labelKey,
      icon: node.nav.icon,
    }));
};
