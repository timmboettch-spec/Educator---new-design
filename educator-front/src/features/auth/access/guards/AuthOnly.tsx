import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import { ROUTE_PATHS } from '../../../../routes/routePath';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import type { GuardProps } from './types';

/**
 * Layer 2 — authentication. Is there a session at all?
 *
 * Applied outermost, so every guard inside it may assume a signed-in identity and skip
 * defensive checks of its own.
 *
 * The loading branch is the one that matters. "Session not yet known" is not "no
 * session": conflating them is what logs users out on every hard refresh, and it is the
 * single most common bug in this layer.
 */
export function AuthOnly({ children, redirect }: GuardProps) {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (identity.isAuthenticated) {
    return <>{children}</>;
  }

  return <Navigate to={redirect?.to ?? ROUTE_PATHS.auth.login} replace />;
}
