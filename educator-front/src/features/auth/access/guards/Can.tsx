import type { ReactNode } from 'react';
import type { RoleSlug } from '../../model/roles';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import { hasEntitlement, hasRole } from '../predicates';
import { isFeatureEnabled } from './requireFeature';
import type { FeatureKey } from './types';

type CanProps = {
  /** Roles allowed to see this. Omit to place no role condition. */
  roles?: readonly RoleSlug[];
  /** Require an active license. A started trial does not satisfy this — see `hasEntitlement`. */
  entitled?: boolean;
  /** Require a feature to be switched on for this account. */
  feature?: FeatureKey;
  /**
   * What to render when denied. Defaults to nothing, which matches how the controls
   * this replaces behave today — they are hidden, not disabled.
   */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * The same access rules, around a control rather than a route.
 *
 * Route-level access rarely matches action-level rights: both roles can open the
 * account page, but only a District Admin may add a subscription. Rather than
 * scattering role comparisons through the markup, the control declares its own
 * condition and reads it through the same predicates the guards use — so a rule can
 * never be written one way for a page and another way for a button on it.
 *
 * Renders the fallback while the session is still resolving. A control is not worth a
 * loader, and briefly showing an action the user turns out not to have is worse than
 * briefly showing nothing.
 */
export function Can({
  roles,
  entitled,
  feature,
  fallback = null,
  children,
}: CanProps) {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <>{fallback}</>;
  }

  if (roles && !hasRole(identity, roles)) {
    return <>{fallback}</>;
  }

  if (entitled && !hasEntitlement(identity)) {
    return <>{fallback}</>;
  }

  if (feature && !isFeatureEnabled(feature, identity)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
