import { Navigate } from 'react-router-dom';
import ContentLoader from '../../../../components/layout/ContentLoader';
import { useSessionIdentity } from '../../model/useSessionIdentity';
import { fallbackRouteFor } from '../fallbackRouteFor';
import type { GuardProps } from './types';

/**
 * Layer 2, mirrored — for pages only a signed-*out* visitor should see: login, signup,
 * password reset.
 *
 * A signed-in visitor is sent to their own landing page rather than a fixed one, so an
 * educator does not land on an admin dashboard they cannot open.
 *
 * Note this is why `fallbackRouteFor` never returns `/login` for an authenticated
 * identity: it would bounce straight back into this guard.
 */
export function GuestOnly({ children, redirect }: GuardProps) {
  const identity = useSessionIdentity();

  if (!identity.isResolved) {
    return <ContentLoader />;
  }

  if (!identity.isAuthenticated) {
    return <>{children}</>;
  }

  return <Navigate to={redirect?.to ?? fallbackRouteFor(identity)} replace />;
}
