import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import type { RoleSlug } from '../../model/roles';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import { fallbackRouteFor } from '../fallbackRouteFor';
import { hasRole } from '../predicates';
import type { GuardComponent, GuardProps } from './types';

/**
 * Layer 4 — authorization. Does this identity's role allow this route?
 *
 * The allow-list is a **non-empty tuple**, so `requireRole([])` fails to compile. An
 * empty list would otherwise read as "no restriction" while behaving as "deny
 * everyone", and this app has no super-identity that could rescue it.
 *
 * Call this only at module scope — inline in the route config, or as a named export.
 * Each call produces a *new component type*, so invoking it during render remounts the
 * whole subtree on every render: child state is lost, effects re-fire and queries
 * re-run.
 */
export const requireRole = (
  allowed: readonly [RoleSlug, ...RoleSlug[]]
): GuardComponent => {
  const RoleGuard = ({ children, redirect }: GuardProps) => {
    const identity = useSessionIdentity();

    // Three branches, never two. Treating "still resolving" as denied bounces people
    // to login on every hard refresh; treating it as allowed flashes the protected
    // page before redirecting away from it.
    if (!identity.isResolved) {
      return <ContentLoader />;
    }

    if (hasRole(identity, allowed)) {
      return <>{children}</>;
    }

    // Denial goes to a route the *denied* identity can actually reach. Sending every
    // refusal to one fixed page strands whichever roles cannot open that page either.
    return <Navigate to={redirect?.to ?? fallbackRouteFor(identity)} replace />;
  };

  RoleGuard.displayName = `requireRole(${allowed.join('|')})`;
  RoleGuard.rules = [{ kind: 'role', roles: allowed }] as const;

  return RoleGuard;
};
