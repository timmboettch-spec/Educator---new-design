import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import { ROUTE_PATHS } from '../../../../routes/routePath';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import { hasEntitlement } from '../predicates';
import type { GuardComponent, GuardProps } from './types';

/**
 * Layer 5 — entitlement. Has this account actually paid for the licensed part of the
 * product?
 *
 * Deliberately **not** satisfied by a started trial — see `hasEntitlement` in
 * `predicates.ts` for why. A trial only unlocks the catalogue/account routes, which
 * don't use this guard at all.
 *
 * Kept apart from `requireRole` because the two fail differently: a role denial is
 * final and sends the user to their own landing page, whereas a missing license is a
 * prompt to redeem. Collapsing both into one boolean throws away the information needed
 * to choose between those two responses — which is exactly how the current sidebar
 * ended up treating "trial" as if it were a role.
 */
const EntitlementGuard = ({ children, redirect }: GuardProps) => {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (hasEntitlement(identity)) {
    return <>{children}</>;
  }

  return <Navigate to={redirect?.to ?? ROUTE_PATHS.auth.redeem} replace />;
};

EntitlementGuard.displayName = 'requireEntitlement';

export const requireEntitlement: GuardComponent = Object.assign(
  EntitlementGuard,
  { rules: [{ kind: 'entitlement' }] as const }
);
