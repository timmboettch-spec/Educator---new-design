import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import { ROUTE_PATHS } from '../../../../routes/routePath';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import type { GuardProps } from './types';

/**
 * Layer 3 — session readiness. The account is signed in, but is it in a state that can
 * use the app at all?
 *
 * One gateway on the authenticated root, rather than the same two checks repeated on
 * every page. It intercepts two conditions:
 *
 * - **A role this portal does not serve.** A `student` or `scenario_admin` account
 *   authenticates perfectly well and then has nowhere to go. It gets an explicit
 *   explanation instead of an empty shell — rendering nothing is a bug at route level.
 * It does *not* handle "more than one role, none chosen". In this codebase that never
 * reaches routing: `LoginRedux` never stores the raw login response, and SignIn only
 * commits a session (`finishLogin`) once a role is chosen, so such a session is simply
 * not authenticated yet and the choice is made in a modal on the sign-in screen.
 *
 * Entitlement is deliberately *not* checked here. An unlicensed District Admin can
 * still use `/redeem` and the catalogue, so blocking the whole app would be wrong —
 * that is a per-route concern, and `requireEntitlement` owns it.
 *
 * Both redirect targets sit **outside** the subtree this guards. If either were inside
 * it, the redirect would re-enter this guard and loop.
 */
export function RequireUsableAccount({ children, redirect }: GuardProps) {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  // Layer 2 runs outside this one, so this is only reachable directly — but it keeps
  // the guard correct when used on its own, around a panel rather than a route.
  if (!identity.isAuthenticated) {
    return <Navigate to={ROUTE_PATHS.auth.login} replace />;
  }

  if (identity.role === null) {
    return <Navigate to={redirect?.to ?? ROUTE_PATHS.auth.noAccess} replace />;
  }

  return <>{children}</>;
}
