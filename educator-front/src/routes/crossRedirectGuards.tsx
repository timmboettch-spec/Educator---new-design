import { Navigate, useLocation } from 'react-router-dom';
import ContentLoader from '../components/layout/ContentLoader';
import { fallbackRouteFor } from '../features/auth/access/fallbackRouteFor';
import type {
  GuardComponent,
  GuardProps,
} from '../features/auth/access/guards';
import { hasEntitlement } from '../features/auth/access/predicates';
import { ROLE } from '../features/auth/model/roles';
import { useSessionIdentity } from '../features/auth/model/useSessionIdentity';
import { ROUTE_PATHS } from './routePath';

/**
 * The three routes whose access rules are genuinely asymmetric, and which the previous
 * router already singled out with "intentional exception" comments.
 *
 * They are kept as bespoke guards rather than forced into `requireRole` because their
 * denial target is *computed*: it depends on a feature flag, and it has to carry the
 * current query string across. A static `redirect` prop cannot express that, and
 * pretending it could would quietly change behaviour.
 *
 * Each still carries `rules`, so navigation can evaluate the same conditions without
 * rendering — the asymmetry is in where a denial *goes*, not in who is allowed.
 */

/**
 * `/lms-integration` — District Admin only, no license required.
 *
 * An educator is sent to Google Classroom when their school has it enabled, and to
 * their dashboard otherwise. Note this means educators never reach the page, so the
 * `isEducator` branches inside `LMSIntegration` are unreachable through this route.
 * Left in place: removing them is a behaviour question, not a routing one.
 */
export const LmsIntegrationGuard: GuardComponent = ({
  children,
}: GuardProps) => {
  const identity = useSessionIdentity();
  const location = useLocation();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (identity.role === ROLE.DISTRICT_ADMIN) {
    return <>{children}</>;
  }

  if (identity.role === ROLE.EDUCATOR) {
    return identity.googleClassroomEnabled ? (
      <Navigate
        to={{
          pathname: ROUTE_PATHS.accountLms.googleClassroom,
          search: location.search,
        }}
        replace
      />
    ) : (
      <Navigate to={ROUTE_PATHS.dashboard.educator} replace />
    );
  }

  return <Navigate to={fallbackRouteFor(identity)} replace />;
};
LmsIntegrationGuard.rules = [
  { kind: 'role', roles: [ROLE.DISTRICT_ADMIN] },
] as const;

/**
 * `/google-classroom` — the mirror image: educator only, and only when the feature is
 * enabled. An entitled admin is sent across to `/lms-integration` with the query string
 * intact; an unentitled one is sent to redeem.
 */
export const GoogleClassroomGuard: GuardComponent = ({
  children,
}: GuardProps) => {
  const identity = useSessionIdentity();
  const location = useLocation();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (identity.role === ROLE.EDUCATOR) {
    return identity.googleClassroomEnabled ? (
      <>{children}</>
    ) : (
      <Navigate to={ROUTE_PATHS.dashboard.educator} replace />
    );
  }

  if (identity.role === ROLE.DISTRICT_ADMIN && hasEntitlement(identity)) {
    return (
      <Navigate
        to={{
          pathname: ROUTE_PATHS.accountLms.lmsIntegration,
          search: location.search,
        }}
        replace
      />
    );
  }

  return <Navigate to={fallbackRouteFor(identity)} replace />;
};
GoogleClassroomGuard.rules = [
  { kind: 'role', roles: [ROLE.EDUCATOR] },
  { kind: 'feature', feature: 'googleClassroom' },
] as const;

/**
 * `/signup/:invite_id` — renders for signed-out *and* signed-in visitors.
 *
 * Someone already signed in as an admin may still be accepting an invitation, so this
 * is neither guest-only nor protected. An educator is bounced to their dashboard, and
 * an unentitled admin to redeem.
 */
export const InviteSignUpGuard: GuardComponent = ({ children }: GuardProps) => {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (!identity.isAuthenticated) {
    return <>{children}</>;
  }

  if (identity.role === ROLE.EDUCATOR) {
    return <Navigate to={ROUTE_PATHS.dashboard.educator} replace />;
  }

  return hasEntitlement(identity) ? (
    <>{children}</>
  ) : (
    <Navigate to={ROUTE_PATHS.auth.redeem} replace />
  );
};

/** Sends a visitor to wherever their identity belongs. Used by `/` and the wildcard. */
export function IdentityLanding() {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  return <Navigate to={fallbackRouteFor(identity)} replace />;
}
