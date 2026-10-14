import type { LucideIcon } from 'lucide-react';
import type { RoleSlug } from '../features/auth/model/roles';
import loginEn from '../locales/auth/login/en.json';

/** Keys the sidebar can label an item with — checked against the locale file itself. */
export type SidebarLabelKey = keyof typeof loginEn.sidebar;

/**
 * Navigation metadata attached to a route node.
 *
 * Its presence is what makes a route navigable: the sidebar is derived from the route
 * tree rather than maintained beside it, so a link can never point at a route the
 * visitor would be bounced from — the classic way these two drift apart.
 */
export type NavMeta = {
  labelKey: SidebarLabelKey;
  icon: LucideIcon;
  /** Position in the single ordered menu. */
  order: number;

  /**
   * Narrows visibility **below** what the route's guards allow. It can never widen it:
   * the derivation applies the route's own rules first and only then this.
   *
   * Needed because a few pages are reachable by a role that is not offered a link to
   * them — the simulation catalogue is the trial experience for an admin and everyday
   * browsing for an educator, but a licensed admin has no use for it in the menu. Those
   * are product decisions rather than access rules, so they live here rather than
   * being smuggled into the guards.
   */
  only?: {
    roles?: readonly RoleSlug[];
    /**
     * Narrows on the license flag. `hasEntitlement` (see `predicates.ts`) checks the
     * same flag now, so a route guarded by `requireEntitlement` and narrowed here
     * agree by construction — this exists independently of that guard for routes with
     * no entitlement guard at all, e.g. the simulation catalogue's `licensed: false`,
     * which has nothing to derive from.
     *
     * `true` shows the item only to licensed accounts; `false`, only to unlicensed.
     * Applies to district admins only — other roles are not licensed per account, so
     * they are unaffected by it.
     */
    licensed?: boolean;
  };
};
